# Market Dashboard Chart Images

This directory contains JPG images of all charts from the market dashboard.

## Generated Charts

The following chart images have been generated from `market-dashboard.html`:

1. **job-category-distribution.jpg** - Pie/Donut chart showing job category distribution
2. **cluster-size-comparison.jpg** - Horizontal bar chart comparing cluster sizes
3. **budget-distribution.jpg** - Bar chart showing budget range distribution
4. **market-treemap.jpg** - Hierarchical treemap showing clusters and sub-clusters

## Regenerating Chart Images

To regenerate all chart images, first ensure the dashboard is up to date:

```bash
cd llm-etl-analysis
npm run charts        # Generate/update the dashboard
npm run chart-images  # Generate chart images
```

This will:
- Load the `market-dashboard.html` file
- Wait for all charts to render (Chart.js and D3.js)
- Capture screenshots of each chart including titles
- Save high-quality JPG images (95% quality) to this directory

## Image Specifications

- **Format**: JPEG
- **Quality**: 95%
- **Dimensions**: Variable (auto-sized to fit chart content)
- **Padding**: 20px around each chart
- **Background**: Dark theme (matches dashboard)

## Chart Details

### Job Category Distribution
- **Type**: Doughnut chart (Chart.js)
- **Shows**: Distribution of jobs across different market clusters
- **Includes**: Legend with cluster names and percentages

### Cluster Size Comparison
- **Type**: Horizontal bar chart (Chart.js)
- **Shows**: Number of jobs in each cluster
- **Includes**: Cluster names and job counts

### Budget Distribution
- **Type**: Vertical bar chart (Chart.js)
- **Shows**: Distribution of jobs across budget ranges ($0-100 to $5K+)
- **Includes**: Budget range labels and job counts

### Market Treemap
- **Type**: Hierarchical treemap (D3.js)
- **Shows**: Clusters and their sub-clusters in a nested visualization
- **Includes**: Interactive hover tooltips (captured as static image)

## Notes

- Images are automatically named based on chart titles
- Existing images are overwritten when regenerating
- The script uses Playwright's headless browser to render the dashboard
- Charts must be fully rendered before capture (script waits for Chart.js and D3.js)

