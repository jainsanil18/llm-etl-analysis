import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
const { kmeans } = require('ml-kmeans');

dotenv.config();

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

interface SubClusterInfo {
  id: number;
  size: number;
  percentage: number;
  centroid: number[];
  representativeJobs: RepresentativeJob[];
  generalizedDescription?: string;
}

interface SubClusterResults {
  analyzedAt: string;
  parentClusters: number[];
  totalJobsInUnion: number;
  optimalSubClusters: number;
  allSubClusters: SubClusterInfo[];
}

// File paths
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_PROCESSED = path.join(ROOT_DIR, 'data', 'processed');

const ANALYSIS_FILE = path.join(DATA_PROCESSED, 'cluster_analysis.json');
const EMBEDDINGS_FILE = path.join(DATA_PROCESSED, 'job_embeddings.json');
const OUTPUT_FILE = path.join(DATA_PROCESSED, 'subcluster_analysis.json');

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

async function generateClusterSummary(jobTitles: string[]): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not found in environment');
  }

  const jobList = jobTitles.map((title, i) =>
    `Job ${i + 1}: ${title}`
  ).join('\n');

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
          content: 'You are analyzing a sub-cluster of similar AI/ML job postings. Provide a concise summary.',
        },
        {
          role: 'user',
          content: `Below are representative job titles from a sub-cluster of AI/ML jobs. Summarize them into a single, concise category description that captures the common theme (1-2 sentences max).

${jobList}

Return ONLY the category description, no preamble.`,
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

async function analyzeSubClusters() {
  console.log('='.repeat(70));
  console.log('  SUB-CLUSTER ANALYSIS: AI/ML JOBS');
  console.log('='.repeat(70));
  console.log();

  // Target clusters: 1 (AI Voice & Agent) and 2 (AI/ML Platform)
  const targetClusters = [1, 2];

  // Load cluster analysis
  console.log('Loading cluster analysis...');
  if (!fs.existsSync(ANALYSIS_FILE)) {
    console.error('❌ cluster_analysis.json not found!');
    process.exit(1);
  }

  const clusterAnalysis = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf-8'));
  console.log(`✓ Loaded cluster analysis`);

  // Load embeddings
  console.log('Loading embeddings...');
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    console.error('❌ job_embeddings.json not found!');
    process.exit(1);
  }

  const allEmbeddings: JobEmbedding[] = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'));
  console.log(`✓ Loaded ${allEmbeddings.length} embeddings`);
  console.log();

  // Filter jobs from target clusters
  console.log(`Filtering jobs from Clusters ${targetClusters.join(' and ')}...`);

  const targetClusterInfos = clusterAnalysis.allClusters.filter((c: any) =>
    targetClusters.includes(c.id)
  );

  // Get URLs from target clusters
  const targetUrls = new Set<string>();
  targetClusterInfos.forEach((cluster: any) => {
    cluster.representativeJobs.forEach((job: any) => {
      targetUrls.add(job.url);
    });
  });

  // Get all job URLs from the clusters by checking the original clustering
  // We need to rebuild the cluster membership from the original analysis
  const embeddingMap = new Map<string, JobEmbedding>();
  allEmbeddings.forEach(emb => embeddingMap.set(emb.url, emb));

  // Get jobs for each target cluster
  const filteredEmbeddings: JobEmbedding[] = [];
  targetClusterInfos.forEach((cluster: any) => {
    cluster.representativeJobs.forEach((repJob: any) => {
      const embedding = embeddingMap.get(repJob.url);
      if (embedding) {
        filteredEmbeddings.push(embedding);
      }
    });
  });

  // Actually, we need a better approach - let's get ALL jobs by matching centroid similarity
  // For now, let's use a simpler approach: get the top N jobs closest to each cluster centroid

  const allFilteredEmbeddings: JobEmbedding[] = [];
  const usedUrls = new Set<string>();

  for (const targetClusterId of targetClusters) {
    const clusterInfo = clusterAnalysis.allClusters.find((c: any) => c.id === targetClusterId);
    if (!clusterInfo) continue;

    const centroid = clusterInfo.centroid;

    // Calculate similarity of all embeddings to this centroid
    const similarities = allEmbeddings.map(emb => ({
      embedding: emb,
      similarity: cosineSimilarity(emb.embedding, centroid),
    }));

    // Sort by similarity and take top jobs (proportional to cluster size)
    similarities.sort((a, b) => b.similarity - a.similarity);
    const numToTake = clusterInfo.size;

    for (let i = 0; i < numToTake && i < similarities.length; i++) {
      if (!usedUrls.has(similarities[i].embedding.url)) {
        allFilteredEmbeddings.push(similarities[i].embedding);
        usedUrls.add(similarities[i].embedding.url);
      }
    }
  }

  const totalJobs = allFilteredEmbeddings.length;
  console.log(`✓ Found ${totalJobs} jobs in union of clusters ${targetClusters.join(' + ')}`);
  console.log();

  if (totalJobs < 10) {
    console.error('❌ Need at least 10 jobs for sub-clustering');
    process.exit(1);
  }

  // Extract embedding vectors
  const embeddingVectors = allFilteredEmbeddings.map(je => je.embedding);

  // Try different K values for sub-clustering
  console.log('Sub-clustering jobs...');
  let bestK = 3;
  let bestScore = -1;
  const minK = Math.min(3, Math.floor(totalJobs / 10));
  const maxK = Math.min(5, Math.floor(totalJobs / 5));

  for (let k = minK; k <= maxK; k++) {
    const result = kmeans(embeddingVectors, k, { initialization: 'kmeans++' });
    const score = calculateSilhouetteScore(embeddingVectors, result.clusters);
    console.log(`  K=${k}: silhouette=${score.toFixed(3)}`);

    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }

  console.log(`✓ Optimal K=${bestK} sub-clusters`);
  console.log();

  // Cluster with optimal K
  const finalClustering = kmeans(embeddingVectors, bestK, { initialization: 'kmeans++' });

  // Build sub-cluster information
  console.log('Analyzing sub-clusters...');

  const clusterSizes = new Map<number, number>();
  finalClustering.clusters.forEach((cluster: number) => {
    clusterSizes.set(cluster, (clusterSizes.get(cluster) || 0) + 1);
  });

  const allSubClusters: SubClusterInfo[] = [];

  for (let i = 0; i < bestK; i++) {
    const size = clusterSizes.get(i) || 0;
    const clusterCentroid = finalClustering.centroids[i];

    // Get jobs in this sub-cluster
    const clusterJobs: Array<{ job: JobEmbedding; embedding: number[] }> = [];
    finalClustering.clusters.forEach((cluster: number, idx: number) => {
      if (cluster === i) {
        clusterJobs.push({
          job: allFilteredEmbeddings[idx],
          embedding: embeddingVectors[idx],
        });
      }
    });

    // Find representative jobs (closest to centroid)
    const similarities = clusterJobs.map(cj => ({
      job: cj.job,
      similarity: cosineSimilarity(cj.embedding, clusterCentroid),
    }));
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topReps = similarities.slice(0, Math.min(5, similarities.length));

    console.log(`  Sub-cluster ${i + 1}: ${size} jobs (${(size / totalJobs * 100).toFixed(1)}%)`);

    allSubClusters.push({
      id: i,
      size,
      percentage: (size / totalJobs) * 100,
      centroid: clusterCentroid,
      representativeJobs: topReps.map(r => ({
        url: r.job.url,
        jobTitle: r.job.jobTitle,
        similarityScore: r.similarity,
      })),
    });
  }

  console.log('✓ Sub-clusters analyzed');
  console.log();

  // Generate summaries for all sub-clusters
  console.log('Generating summaries for all sub-clusters...');

  for (const subCluster of allSubClusters) {
    const topTitles = subCluster.representativeJobs.slice(0, 5).map(j => j.jobTitle);
    try {
      const summary = await generateClusterSummary(topTitles);
      subCluster.generalizedDescription = summary;
      console.log(`  ✓ Sub-cluster ${subCluster.id + 1} summary generated`);
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.log(`  ⚠️  Sub-cluster ${subCluster.id + 1} summary failed: ${error.message}`);
    }
  }

  console.log('✓ All summaries generated');
  console.log();

  // Build final results
  const results: SubClusterResults = {
    analyzedAt: new Date().toISOString(),
    parentClusters: targetClusters,
    totalJobsInUnion: totalJobs,
    optimalSubClusters: bestK,
    allSubClusters: allSubClusters.sort((a, b) => b.size - a.size), // Sort by size
  };

  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  // Display results
  console.log('='.repeat(70));
  console.log('  RESULTS');
  console.log('='.repeat(70));
  console.log();
  console.log(`Parent Clusters: ${targetClusters.join(' + ')}`);
  console.log(`Total Jobs in Union: ${totalJobs}`);
  console.log(`Sub-Clusters Found: ${bestK}`);
  console.log();

  allSubClusters.forEach((subCluster, idx) => {
    console.log(`${idx + 1}. SUB-CLUSTER ${subCluster.id + 1}`);
    console.log(`   Size: ${subCluster.size} jobs (${subCluster.percentage.toFixed(1)}%)`);
    console.log();

    if (subCluster.generalizedDescription) {
      console.log(`   Summary: ${subCluster.generalizedDescription}`);
      console.log();
    }

    console.log('   Top 5 Representative Jobs:');
    subCluster.representativeJobs.forEach((job, i) => {
      const similarity = (job.similarityScore * 100).toFixed(0);
      const title = job.jobTitle.length > 75 ? job.jobTitle.substring(0, 75) + '...' : job.jobTitle;
      console.log(`   ${i + 1}. ${title}`);
      console.log(`      Similarity: ${similarity}%`);
    });
    console.log();
    console.log('-'.repeat(70));
  });

  console.log();
  console.log(`✓ Sub-cluster analysis saved to ${OUTPUT_FILE}`);
  console.log('='.repeat(70));
}

// Run analysis
analyzeSubClusters()
  .then(() => {
    console.log('\n✅ Sub-cluster analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Analysis failed:', error.message);
    process.exit(1);
  });
