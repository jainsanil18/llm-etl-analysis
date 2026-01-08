import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
const { kmeans } = require('ml-kmeans');

dotenv.config();

interface ScrapedJob {
  jobTitle: string;
  budget: string;
  postedTime: string;
  description: string;
  url: string;
  scrapedAt: string;
}

interface JobEmbedding {
  url: string;
  jobTitle: string;
  embedding: number[];
  embeddedAt: string;
}

interface RepresentativeJob {
  url: string;
  jobTitle: string;
  similarityScore: number;
}

interface ClusterInfo {
  id: number;
  size: number;
  percentage: number;
  centroid: number[];
  representativeJobs: RepresentativeJob[];
  generalizedDescription?: string;
}

interface AnalysisResults {
  analyzedAt: string;
  totalJobs: number;
  validJobs: number;
  optimalClusters: number;
  largestCluster: ClusterInfo;
  allClusters: ClusterInfo[];
}

// File paths
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_PROCESSED = path.join(ROOT_DIR, 'data', 'processed');

const SCRAPED_JOBS_FILE = path.join(DATA_PROCESSED, 'scraped_jobs_ai.json');
const EMBEDDINGS_FILE = path.join(DATA_PROCESSED, 'job_embeddings.json');
const ANALYSIS_FILE = path.join(DATA_PROCESSED, 'cluster_analysis.json');

async function generateEmbedding(text: string): Promise<number[]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not found in environment');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000), // Limit to ~8k chars to stay within token limits
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

function calculateSilhouetteScore(data: number[][], clusters: number[]): number {
  const n = data.length;
  const clusterMap = new Map<number, number[]>();

  // Group indices by cluster
  clusters.forEach((cluster, idx) => {
    if (!clusterMap.has(cluster)) {
      clusterMap.set(cluster, []);
    }
    clusterMap.get(cluster)!.push(idx);
  });

  let totalScore = 0;

  for (let i = 0; i < n; i++) {
    const myCluster = clusters[i];
    const myClusterIndices = clusterMap.get(myCluster)!;

    // Calculate a(i): average distance to points in same cluster
    let a = 0;
    if (myClusterIndices.length > 1) {
      for (const idx of myClusterIndices) {
        if (idx !== i) {
          a += 1 - cosineSimilarity(data[i], data[idx]);
        }
      }
      a /= (myClusterIndices.length - 1);
    }

    // Calculate b(i): min average distance to points in other clusters
    let b = Infinity;
    for (const [cluster, indices] of clusterMap.entries()) {
      if (cluster !== myCluster) {
        let avgDist = 0;
        for (const idx of indices) {
          avgDist += 1 - cosineSimilarity(data[i], data[idx]);
        }
        avgDist /= indices.length;
        b = Math.min(b, avgDist);
      }
    }

    const s = (b - a) / Math.max(a, b);
    totalScore += s;
  }

  return totalScore / n;
}

async function generateClusterSummary(jobDescriptions: string[]): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not found in environment');
  }

  const jobList = jobDescriptions.map((desc, i) =>
    `Job ${i + 1}: ${desc.substring(0, 500)}`
  ).join('\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are analyzing a cluster of similar job postings. Provide a concise summary.',
        },
        {
          role: 'user',
          content: `Below are 5 representative jobs from the largest cluster of similar jobs. Summarize them into a single, generalized job description that captures:
- The shared technology stack and architecture
- The common business goal or use case
- Typical project scope and deliverables
- Required skills and experience

Keep it concise (2-3 sentences).

${jobList}

Return ONLY the summary description, no preamble.`,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function analyzeJobs() {
  console.log('='.repeat(70));
  console.log('  JOB CLUSTERING ANALYSIS');
  console.log('='.repeat(70));
  console.log();

  // Step 1: Load scraped jobs
  console.log('Loading jobs from scraped_jobs_ai.json...');
  if (!fs.existsSync(SCRAPED_JOBS_FILE)) {
    console.error('❌ scraped_jobs_ai.json not found!');
    process.exit(1);
  }

  const allJobs: ScrapedJob[] = JSON.parse(fs.readFileSync(SCRAPED_JOBS_FILE, 'utf-8'));
  console.log(`✓ Found ${allJobs.length} total jobs`);

  // Filter out invalid jobs
  const validJobs = allJobs.filter(job =>
    job.jobTitle !== 'PRIVATE LISTING' &&
    job.jobTitle !== 'ERROR' &&
    job.jobTitle !== 'N/A' &&
    job.description !== 'PRIVATE' &&
    job.description !== 'ERROR' &&
    job.description !== 'N/A' &&
    job.description.length > 50
  );

  console.log(`✓ Filtered to ${validJobs.length} valid jobs`);

  if (validJobs.length < 10) {
    console.error('❌ Need at least 10 valid jobs for clustering analysis');
    process.exit(1);
  }

  console.log();

  // Step 2: Generate/load embeddings
  console.log('Generating embeddings...');

  let existingEmbeddings: JobEmbedding[] = [];
  if (fs.existsSync(EMBEDDINGS_FILE)) {
    try {
      existingEmbeddings = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'));
      console.log(`✓ Loaded ${existingEmbeddings.length} cached embeddings`);
    } catch (e) {
      console.log('⚠️  Could not load cached embeddings, starting fresh');
    }
  }

  const embeddingMap = new Map<string, JobEmbedding>();
  existingEmbeddings.forEach(emb => embeddingMap.set(emb.url, emb));

  const jobEmbeddings: JobEmbedding[] = [];
  let newEmbeddingsCount = 0;

  for (const job of validJobs) {
    if (embeddingMap.has(job.url)) {
      jobEmbeddings.push(embeddingMap.get(job.url)!);
    } else {
      console.log(`  Generating embedding for: ${job.jobTitle.substring(0, 50)}...`);
      const embedding = await generateEmbedding(job.description);
      const jobEmb: JobEmbedding = {
        url: job.url,
        jobTitle: job.jobTitle,
        embedding,
        embeddedAt: new Date().toISOString(),
      };
      jobEmbeddings.push(jobEmb);
      newEmbeddingsCount++;

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`✓ Generated ${newEmbeddingsCount} new embeddings`);

  // Save embeddings
  fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(jobEmbeddings, null, 2));
  console.log(`✓ Saved to ${EMBEDDINGS_FILE}`);
  console.log();

  // Step 3: Cluster jobs
  console.log('Clustering jobs...');

  const embeddingVectors = jobEmbeddings.map(je => je.embedding);

  // Try different K values and find optimal using silhouette score
  let bestK = 3;
  let bestScore = -1;
  const minK = Math.min(3, Math.floor(validJobs.length / 5));
  const maxK = Math.min(7, Math.floor(validJobs.length / 3));

  for (let k = minK; k <= maxK; k++) {
    const result = kmeans(embeddingVectors, k, { initialization: 'kmeans++' });
    const score = calculateSilhouetteScore(embeddingVectors, result.clusters);
    console.log(`✓ Testing K=${k}: silhouette=${score.toFixed(3)}`);

    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }

  console.log(`✓ Optimal K=${bestK} clusters`);
  console.log();

  // Cluster with optimal K
  const finalClustering = kmeans(embeddingVectors, bestK, { initialization: 'kmeans++' });

  // Step 4: Analyze clusters
  console.log('Finding largest cluster...');

  const clusterSizes = new Map<number, number>();
  finalClustering.clusters.forEach((cluster: number) => {
    clusterSizes.set(cluster, (clusterSizes.get(cluster) || 0) + 1);
  });

  let largestClusterId = 0;
  let largestClusterSize = 0;
  clusterSizes.forEach((size, id) => {
    if (size > largestClusterSize) {
      largestClusterSize = size;
      largestClusterId = id;
    }
  });

  console.log(`✓ Cluster ${largestClusterId} has ${largestClusterSize} jobs (${(largestClusterSize / validJobs.length * 100).toFixed(1)}%)`);
  console.log();

  // Step 5: Find representative jobs from largest cluster
  console.log('Generating summary...');

  const centroid = finalClustering.centroids[largestClusterId];
  const clusterJobs: Array<{ job: ScrapedJob; embedding: number[]; index: number }> = [];

  finalClustering.clusters.forEach((cluster: number, idx: number) => {
    if (cluster === largestClusterId) {
      clusterJobs.push({
        job: validJobs[idx],
        embedding: embeddingVectors[idx],
        index: idx,
      });
    }
  });

  // Find 5 jobs closest to centroid
  const similarities = clusterJobs.map(cj => ({
    job: cj.job,
    similarity: cosineSimilarity(cj.embedding, centroid),
  }));

  similarities.sort((a, b) => b.similarity - a.similarity);
  const top5 = similarities.slice(0, Math.min(5, similarities.length));

  console.log(`✓ Found ${top5.length} representative jobs`);

  // Generate summary description
  const top5Descriptions = top5.map(s => s.job.description);
  const summary = await generateClusterSummary(top5Descriptions);
  console.log('✓ Generated description');
  console.log();

  // Build all clusters info
  const allClusters: ClusterInfo[] = [];
  for (let i = 0; i < bestK; i++) {
    const size = clusterSizes.get(i) || 0;
    const clusterCentroid = finalClustering.centroids[i];

    const clusterJobsForThis: Array<{ job: ScrapedJob; embedding: number[] }> = [];
    finalClustering.clusters.forEach((cluster: number, idx: number) => {
      if (cluster === i) {
        clusterJobsForThis.push({
          job: validJobs[idx],
          embedding: embeddingVectors[idx],
        });
      }
    });

    const sims = clusterJobsForThis.map(cj => ({
      job: cj.job,
      similarity: cosineSimilarity(cj.embedding, clusterCentroid),
    }));
    sims.sort((a, b) => b.similarity - a.similarity);
    const topReps = sims.slice(0, Math.min(5, sims.length));

    allClusters.push({
      id: i,
      size,
      percentage: (size / validJobs.length) * 100,
      centroid: clusterCentroid,
      representativeJobs: topReps.map(r => ({
        url: r.job.url,
        jobTitle: r.job.jobTitle,
        similarityScore: r.similarity,
      })),
    });
  }

  // Add summary to largest cluster
  const largestClusterInfo = allClusters.find(c => c.id === largestClusterId)!;
  largestClusterInfo.generalizedDescription = summary;

  // Build final results
  const results: AnalysisResults = {
    analyzedAt: new Date().toISOString(),
    totalJobs: allJobs.length,
    validJobs: validJobs.length,
    optimalClusters: bestK,
    largestCluster: largestClusterInfo,
    allClusters,
  };

  // Save results
  fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(results, null, 2));

  // Display results
  console.log('='.repeat(70));
  console.log('  RESULTS');
  console.log('='.repeat(70));
  console.log();
  console.log(`Most Common Job Type (${largestClusterInfo.percentage.toFixed(1)}% of jobs):`);
  console.log();
  console.log(`"${summary}"`);
  console.log();
  console.log('Representative Jobs:');
  largestClusterInfo.representativeJobs.forEach((job, i) => {
    console.log(`${i + 1}. ${job.jobTitle.substring(0, 70)}... (${(job.similarityScore * 100).toFixed(0)}% similar)`);
  });
  console.log();
  console.log(`✓ Analysis saved to ${ANALYSIS_FILE}`);
  console.log('='.repeat(70));
}

// Run analysis
analyzeJobs()
  .then(() => {
    console.log('\n✅ Analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Analysis failed:', error.message);
    process.exit(1);
  });
