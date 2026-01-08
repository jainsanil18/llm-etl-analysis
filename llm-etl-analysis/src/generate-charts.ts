import * as fs from 'fs';
import * as path from 'path';

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

interface ClusterAnalysis {
  analyzedAt: string;
  totalJobs: number;
  validJobs: number;
  optimalClusters: number;
  largestCluster: ClusterInfo;
  allClusters: ClusterInfo[];
}

interface SubClusterInfo {
  id: number;
  size: number;
  percentage: number;
  centroid: number[];
  representativeJobs: RepresentativeJob[];
  generalizedDescription?: string;
}

interface SubClusterAnalysis {
  analyzedAt: string;
  parentClusters: number[];
  totalJobsInUnion: number;
  optimalSubClusters: number;
  allSubClusters: SubClusterInfo[];
}

interface ScrapedJob {
  jobTitle: string;
  budget: string;
  postedTime: string;
  description: string;
  url: string;
  scrapedAt: string;
}

// File paths
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_PROCESSED = path.join(ROOT_DIR, 'data', 'processed');

const CLUSTER_FILE = path.join(DATA_PROCESSED, 'cluster_analysis.json');
const SUBCLUSTER_FILE = path.join(DATA_PROCESSED, 'subcluster_analysis.json');
const SCRAPED_JOBS_FILE = path.join(DATA_PROCESSED, 'scraped_jobs_ai.json');
const OUTPUT_HTML = path.join(ROOT_DIR, 'llm-etl-analysis', 'market-dashboard.html');

// Derive readable cluster names from representative jobs
function deriveClusterName(cluster: ClusterInfo, usedNames: Set<string>): string {
  const titles = cluster.representativeJobs.map(j => j.jobTitle.toLowerCase());
  const titleText = titles.join(' ');
  
  // Count keyword occurrences for better differentiation
  const hasAI = (titleText.match(/\bai\b/g) || []).length;
  const hasVoice = titleText.includes('voice');
  const hasAgent = titleText.includes('agent') || titleText.includes('multi-agent');
  const hasPlatform = titleText.includes('platform');
  const hasNext = titleText.includes('next.js') || titleText.includes('next ');
  const hasReact = titleText.includes('react');
  const hasReactNative = titleText.includes('react native') || titleText.includes('react-native');
  const hasFullStack = titleText.includes('full-stack') || titleText.includes('full stack');
  const hasSaaS = titleText.includes('saas');
  const hasDashboard = titleText.includes('dashboard') || titleText.includes('admin');
  const hasPython = titleText.includes('python') || titleText.includes('django');
  const hasNode = titleText.includes('node');
  const hasLovable = titleText.includes('lovable') || titleText.includes('replit');
  const hasPortal = titleText.includes('portal');
  const hasOngoing = titleText.includes('ongoing') || titleText.includes('exciting');
  
  let name = '';
  
  // Priority-based naming with better differentiation
  if (hasVoice && hasAI >= 1) {
    name = 'AI Voice & Agents';
  } else if (hasAgent && hasAI >= 1) {
    name = 'Multi-Agent AI Systems';
  } else if (hasAI >= 2 && hasPlatform) {
    name = 'AI/ML Platforms';
  } else if (hasLovable || (hasNext && hasDashboard)) {
    name = 'Modern Web Apps (Next.js/Lovable)';
  } else if (hasPortal && hasPython) {
    name = 'Web Portals & Python Dev';
  } else if (hasFullStack && hasReactNative) {
    name = 'Full-Stack (React Native)';
  } else if (hasFullStack && hasReact && hasNode && !hasNext && !hasPython) {
    name = 'Full-Stack (React & Node.js)';
  } else if (hasFullStack && hasAI >= 1 && hasSaaS) {
    name = 'AI Full-Stack & SaaS';
  } else if (hasFullStack && hasPython) {
    name = 'Full-Stack (Python/Django)';
  } else if (hasFullStack && hasOngoing) {
    name = 'General Full-Stack Projects';
  } else if (titleText.includes('backend') || titleText.includes('api')) {
    name = 'Backend & APIs';
  } else if (titleText.includes('mobile') || titleText.includes('ios') || titleText.includes('android')) {
    name = 'Mobile Development';
  } else if (titleText.includes('blockchain') || titleText.includes('web3')) {
    name = 'Blockchain/Web3';
  } else if (titleText.includes('automation')) {
    name = 'Automation & Integration';
  } else {
    // Fallback: use first job title keywords
    const firstTitle = cluster.representativeJobs[0]?.jobTitle || `Cluster ${cluster.id}`;
    name = firstTitle.length > 30 ? firstTitle.substring(0, 30) + '...' : firstTitle;
  }
  
  // Ensure uniqueness
  if (usedNames.has(name)) {
    name = `${name} (${cluster.size} jobs)`;
  }
  usedNames.add(name);
  
  return name;
}

// Parse budget string to numeric value
function parseBudget(budget: string): number | null {
  if (!budget || budget === 'N/A' || budget === 'PRIVATE' || budget === 'ERROR') {
    return null;
  }
  
  // Extract numeric value from strings like "$200.00 Fixed Price", "$15.00 - $30.00 Hourly"
  const match = budget.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
  if (match) {
    return parseFloat(match[1].replace(',', ''));
  }
  return null;
}

// Categorize budget into ranges
function categorizeBudget(amount: number): string {
  if (amount < 100) return '$0-100';
  if (amount < 250) return '$100-250';
  if (amount < 500) return '$250-500';
  if (amount < 1000) return '$500-1K';
  if (amount < 2500) return '$1K-2.5K';
  if (amount < 5000) return '$2.5K-5K';
  return '$5K+';
}

function generateDashboard() {
  console.log('='.repeat(70));
  console.log('  GENERATING MARKET DASHBOARD');
  console.log('='.repeat(70));
  console.log();

  // Load data
  console.log('Loading data...');
  
  if (!fs.existsSync(CLUSTER_FILE)) {
    console.error('❌ cluster_analysis.json not found!');
    process.exit(1);
  }
  
  const clusterAnalysis: ClusterAnalysis = JSON.parse(fs.readFileSync(CLUSTER_FILE, 'utf-8'));
  console.log(`✓ Loaded ${clusterAnalysis.allClusters.length} clusters`);

  let subclusterAnalysis: SubClusterAnalysis | null = null;
  if (fs.existsSync(SUBCLUSTER_FILE)) {
    subclusterAnalysis = JSON.parse(fs.readFileSync(SUBCLUSTER_FILE, 'utf-8'));
    console.log(`✓ Loaded ${subclusterAnalysis!.allSubClusters.length} sub-clusters`);
  }

  const scrapedJobs: ScrapedJob[] = JSON.parse(fs.readFileSync(SCRAPED_JOBS_FILE, 'utf-8'));
  console.log(`✓ Loaded ${scrapedJobs.length} jobs`);
  console.log();

  // Process cluster data for charts
  const usedNames = new Set<string>();
  const clusterData = clusterAnalysis.allClusters
    .sort((a, b) => b.size - a.size)
    .map(cluster => ({
      id: cluster.id,
      name: deriveClusterName(cluster, usedNames),
      size: cluster.size,
      percentage: cluster.percentage,
      description: cluster.generalizedDescription || '',
      topJobs: cluster.representativeJobs.slice(0, 3).map(j => j.jobTitle)
    }));

  // Process budget data
  const budgetCounts: Record<string, number> = {
    '$0-100': 0,
    '$100-250': 0,
    '$250-500': 0,
    '$500-1K': 0,
    '$1K-2.5K': 0,
    '$2.5K-5K': 0,
    '$5K+': 0
  };
  
  let validBudgetCount = 0;
  scrapedJobs.forEach(job => {
    const amount = parseBudget(job.budget);
    if (amount !== null) {
      const category = categorizeBudget(amount);
      budgetCounts[category]++;
      validBudgetCount++;
    }
  });

  console.log(`✓ Processed ${validBudgetCount} jobs with valid budgets`);

  // Process treemap data (clusters → sub-clusters)
  interface TreemapNode {
    name: string;
    value?: number;
    children?: TreemapNode[];
  }

  // Helper to derive short sub-cluster names from descriptions
  const deriveSubClusterName = (sub: SubClusterInfo): string => {
    const desc = (sub.generalizedDescription || '').toLowerCase();
    const titles = sub.representativeJobs.map(j => j.jobTitle.toLowerCase()).join(' ');
    
    // Order matters - check more specific patterns first
    if (desc.includes('founding engineer') || desc.includes('profitable')) return 'AI SaaS Founders';
    if (desc.includes('voice ai') || (desc.includes('voice') && desc.includes('customer service'))) return 'Voice AI Development';
    if (desc.includes('multi-agent') || titles.includes('multi-agent') || titles.includes('orchestration')) return 'Multi-Agent Systems';
    if (desc.includes('chat platform') || desc.includes('blockchain')) return 'AI Chat & Blockchain';
    if (desc.includes('chatbot') || titles.includes('chatbot')) return 'Chatbot Development';
    if (titles.includes('llm') || titles.includes('langchain')) return 'LLM Engineering';
    
    // Fallback: extract key terms from first job title
    const firstJob = sub.representativeJobs[0]?.jobTitle || `Sub-cluster ${sub.id + 1}`;
    return firstJob.length > 25 ? firstJob.substring(0, 25) + '...' : firstJob;
  };

  const treemapData: TreemapNode = {
    name: 'All Jobs',
    children: clusterData.map(cluster => {
      // Check if this cluster has sub-clusters
      const isAICluster = subclusterAnalysis && 
        subclusterAnalysis.parentClusters.includes(cluster.id);
      
      if (isAICluster && subclusterAnalysis) {
        return {
          name: cluster.name,
          children: subclusterAnalysis.allSubClusters.map(sub => ({
            name: deriveSubClusterName(sub),
            value: sub.size
          }))
        };
      }
      
      return {
        name: cluster.name,
        value: cluster.size
      };
    })
  };

  // Color palette - vibrant, distinct colors
  const colors = [
    '#6366f1', // Indigo
    '#f43f5e', // Rose  
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#84cc16', // Lime
  ];

  // Generate HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Freelance Job Market Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-card: #1a1a24;
      --bg-hover: #242432;
      --text-primary: #f4f4f5;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --accent-1: #6366f1;
      --accent-2: #f43f5e;
      --accent-3: #10b981;
      --border: #27272a;
      --glow: rgba(99, 102, 241, 0.15);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.6;
    }

    .dashboard {
      max-width: 1600px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      text-align: center;
      margin-bottom: 3rem;
      padding: 2rem;
      background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%);
      border-radius: 20px;
      border: 1px solid var(--border);
      position: relative;
      overflow: hidden;
    }

    header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent-1), var(--accent-2), var(--accent-3));
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-1) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: var(--text-secondary);
      font-size: 1.1rem;
      font-weight: 300;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      text-align: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px var(--glow);
    }

    .stat-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 2.5rem;
      font-weight: 600;
      color: var(--accent-1);
    }

    .stat-label {
      color: var(--text-secondary);
      font-size: 0.9rem;
      margin-top: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .charts-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 2rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 1200px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
    }

    .chart-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 1.5rem;
      position: relative;
    }

    .chart-card.full-width {
      grid-column: 1 / -1;
    }

    .chart-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .chart-title::before {
      content: '';
      width: 4px;
      height: 24px;
      background: linear-gradient(180deg, var(--accent-1), var(--accent-2));
      border-radius: 2px;
    }

    .chart-container {
      position: relative;
      height: 350px;
    }

    .chart-container.tall {
      height: 500px;
    }

    #treemap {
      width: 100%;
      height: 100%;
    }

    .treemap-cell {
      stroke: var(--bg-primary);
      stroke-width: 2px;
      transition: opacity 0.2s;
    }

    .treemap-cell:hover {
      opacity: 0.8;
    }

    .treemap-label {
      font-family: 'Outfit', sans-serif;
      font-size: 11px;
      fill: white;
      pointer-events: none;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }

    .treemap-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      fill: rgba(255,255,255,0.7);
      pointer-events: none;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-top: 1rem;
      justify-content: center;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 3px;
    }

    footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    footer a {
      color: var(--accent-1);
      text-decoration: none;
    }

    .tooltip {
      position: absolute;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 100;
      max-width: 300px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }

    .tooltip.visible {
      opacity: 1;
    }

    .tooltip-title {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .tooltip-value {
      font-family: 'JetBrains Mono', monospace;
      color: var(--accent-1);
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <header>
      <h1>Freelance Job Market Analysis</h1>
      <p class="subtitle">ML-powered clustering of ${clusterAnalysis.validJobs} freelance opportunities</p>
    </header>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${clusterAnalysis.totalJobs}</div>
        <div class="stat-label">Total Jobs Scraped</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${clusterAnalysis.validJobs}</div>
        <div class="stat-label">Valid Jobs Analyzed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${clusterAnalysis.optimalClusters}</div>
        <div class="stat-label">Market Clusters</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${validBudgetCount}</div>
        <div class="stat-label">Jobs with Budgets</div>
      </div>
    </div>

    <div class="charts-grid">
      <!-- Chart 1: Pie/Donut - Job Category Distribution -->
      <div class="chart-card">
        <h2 class="chart-title">Job Category Distribution</h2>
        <div class="chart-container">
          <canvas id="pieChart"></canvas>
        </div>
      </div>

      <!-- Chart 3: Bar Chart - Cluster Sizes -->
      <div class="chart-card">
        <h2 class="chart-title">Cluster Size Comparison</h2>
        <div class="chart-container">
          <canvas id="barChart"></canvas>
        </div>
      </div>

      <!-- Chart 7: Budget Distribution -->
      <div class="chart-card">
        <h2 class="chart-title">Budget Distribution</h2>
        <div class="chart-container">
          <canvas id="budgetChart"></canvas>
        </div>
      </div>

      <!-- Chart 2: Treemap - Hierarchical View -->
      <div class="chart-card">
        <h2 class="chart-title">Market Treemap (Clusters → Sub-clusters)</h2>
        <div class="chart-container tall">
          <svg id="treemap"></svg>
        </div>
      </div>
    </div>

    <footer>
      <p>Generated on ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <p>Analysis via K-means clustering with OpenAI embeddings</p>
    </footer>
  </div>

  <div class="tooltip" id="tooltip">
    <div class="tooltip-title"></div>
    <div class="tooltip-value"></div>
  </div>

  <script>
    // Data from analysis
    const clusterData = ${JSON.stringify(clusterData)};
    const budgetData = ${JSON.stringify(budgetCounts)};
    const treemapData = ${JSON.stringify(treemapData)};
    const colors = ${JSON.stringify(colors)};

    // Chart.js defaults
    Chart.defaults.color = '#a1a1aa';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    // 1. Pie/Donut Chart
    new Chart(document.getElementById('pieChart'), {
      type: 'doughnut',
      data: {
        labels: clusterData.map(c => c.name),
        datasets: [{
          data: clusterData.map(c => c.size),
          backgroundColor: colors,
          borderColor: '#0a0a0f',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              padding: 15,
              usePointStyle: true,
              pointStyle: 'rectRounded',
              font: { size: 11 }
            }
          },
          tooltip: {
            backgroundColor: '#1a1a24',
            borderColor: '#27272a',
            borderWidth: 1,
            titleFont: { weight: 600 },
            bodyFont: { family: "'JetBrains Mono', monospace" },
            padding: 12,
            callbacks: {
              label: (ctx) => {
                const cluster = clusterData[ctx.dataIndex];
                return \` \${cluster.size} jobs (\${cluster.percentage.toFixed(1)}%)\`;
              }
            }
          }
        }
      }
    });

    // 3. Bar Chart
    new Chart(document.getElementById('barChart'), {
      type: 'bar',
      data: {
        labels: clusterData.map(c => c.name),
        datasets: [{
          label: 'Number of Jobs',
          data: clusterData.map(c => c.size),
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a24',
            borderColor: '#27272a',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              afterLabel: (ctx) => {
                const cluster = clusterData[ctx.dataIndex];
                return \`\${cluster.percentage.toFixed(1)}% of market\`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#27272a' },
            ticks: { font: { family: "'JetBrains Mono', monospace" } }
          },
          y: {
            grid: { display: false },
            ticks: { 
              font: { size: 11 }
            }
          }
        }
      }
    });

    // 7. Budget Distribution
    new Chart(document.getElementById('budgetChart'), {
      type: 'bar',
      data: {
        labels: Object.keys(budgetData),
        datasets: [{
          label: 'Number of Jobs',
          data: Object.values(budgetData),
          backgroundColor: [
            '#10b981aa', '#22c55eaa', '#84cc16aa', '#eab308aa', 
            '#f59e0baa', '#f97316aa', '#ef4444aa'
          ],
          borderColor: [
            '#10b981', '#22c55e', '#84cc16', '#eab308',
            '#f59e0b', '#f97316', '#ef4444'
          ],
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a24',
            borderColor: '#27272a',
            borderWidth: 1,
            padding: 12
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } }
          },
          y: {
            grid: { color: '#27272a' },
            ticks: { font: { family: "'JetBrains Mono', monospace" } }
          }
        }
      }
    });

    // 2. Treemap with D3
    const treemapSvg = d3.select('#treemap');
    const container = document.querySelector('.chart-container.tall');
    const width = container.clientWidth - 32;
    const height = 460;
    
    treemapSvg.attr('width', width).attr('height', height);

    const treemapColors = d3.scaleOrdinal()
      .domain(clusterData.map(c => c.name))
      .range(colors);

    const root = d3.hierarchy(treemapData)
      .sum(d => d.value || 0)
      .sort((a, b) => b.value - a.value);

    d3.treemap()
      .size([width, height])
      .paddingOuter(4)
      .paddingInner(2)
      .paddingTop(22)
      .round(true)(root);

    const cell = treemapSvg.selectAll('g')
      .data(root.descendants().filter(d => d.depth > 0))
      .join('g')
      .attr('transform', d => \`translate(\${d.x0},\${d.y0})\`);

    cell.append('rect')
      .attr('class', 'treemap-cell')
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => d.y1 - d.y0)
      .attr('fill', d => {
        if (d.depth === 1) return treemapColors(d.data.name);
        return d3.color(treemapColors(d.parent.data.name)).darker(0.5);
      })
      .attr('rx', 4);

    // Add labels for cells with enough space
    cell.filter(d => (d.x1 - d.x0) > 60 && (d.y1 - d.y0) > 30)
      .append('text')
      .attr('class', 'treemap-label')
      .attr('x', 6)
      .attr('y', 16)
      .text(d => {
        const name = d.data.name;
        const maxLen = Math.floor((d.x1 - d.x0 - 12) / 6);
        return name.length > maxLen ? name.substring(0, maxLen) + '...' : name;
      });

    cell.filter(d => (d.x1 - d.x0) > 50 && (d.y1 - d.y0) > 45)
      .append('text')
      .attr('class', 'treemap-value')
      .attr('x', 6)
      .attr('y', 30)
      .text(d => d.value + ' jobs');

    // Tooltip
    const tooltip = document.getElementById('tooltip');
    
    cell.on('mouseenter', (event, d) => {
      tooltip.querySelector('.tooltip-title').textContent = d.data.name;
      tooltip.querySelector('.tooltip-value').textContent = \`\${d.value} jobs\`;
      tooltip.classList.add('visible');
    })
    .on('mousemove', (event) => {
      tooltip.style.left = (event.pageX + 10) + 'px';
      tooltip.style.top = (event.pageY - 30) + 'px';
    })
    .on('mouseleave', () => {
      tooltip.classList.remove('visible');
    });

    // Handle resize
    window.addEventListener('resize', () => {
      const newWidth = container.clientWidth - 32;
      treemapSvg.attr('width', newWidth);
      // Would need to re-run treemap layout for full responsiveness
    });
  </script>
</body>
</html>`;

  // Write HTML file
  fs.writeFileSync(OUTPUT_HTML, html);
  console.log(`✓ Dashboard saved to ${OUTPUT_HTML}`);
  console.log();
  console.log('='.repeat(70));
  console.log('  DASHBOARD GENERATED SUCCESSFULLY');
  console.log('='.repeat(70));
  console.log();
  console.log('Open the file in a browser to view:');
  console.log(`  ${OUTPUT_HTML}`);
}

// Run
generateDashboard();

