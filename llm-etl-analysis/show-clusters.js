const data = require('./cluster_analysis.json');

console.log('======================================================================');
console.log('  TOP 5 LARGEST JOB CLUSTERS');
console.log('======================================================================\n');

const sorted = data.allClusters.sort((a,b) => b.size - a.size).slice(0,5);

sorted.forEach((cluster, index) => {
  console.log(`\n${index + 1}. CLUSTER ${cluster.id}`);
  console.log(`   Size: ${cluster.size} jobs (${cluster.percentage.toFixed(1)}% of all jobs)`);
  console.log(`\n   Top 5 Representative Jobs:`);

  cluster.representativeJobs.forEach((job, idx) => {
    const similarity = (job.similarityScore * 100).toFixed(0);
    const title = job.jobTitle.length > 75 ? job.jobTitle.substring(0, 75) + '...' : job.jobTitle;
    console.log(`   ${idx + 1}. ${title}`);
    console.log(`      Similarity: ${similarity}%`);
  });

  if (cluster.generalizedDescription) {
    console.log(`\n   Summary:`);
    console.log(`   ${cluster.generalizedDescription}`);
  }

  console.log('\n' + '-'.repeat(70));
});

console.log('\n======================================================================');
console.log(`Total Valid Jobs Analyzed: ${data.validJobs}`);
console.log(`Optimal Number of Clusters: ${data.optimalClusters}`);
console.log('======================================================================');
