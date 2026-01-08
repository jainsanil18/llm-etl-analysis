import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

// File paths
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DASHBOARD_HTML = path.join(ROOT_DIR, 'llm-etl-analysis', 'market-dashboard.html');
const OUTPUT_DIR = path.join(ROOT_DIR, 'charts');

// Chart configurations
interface ChartConfig {
  id: string;
  name: string;
  selector: string;
  type: 'canvas' | 'svg';
}

const CHARTS: ChartConfig[] = [
  {
    id: 'pieChart',
    name: 'Job Category Distribution',
    selector: '#pieChart',
    type: 'canvas'
  },
  {
    id: 'barChart',
    name: 'Cluster Size Comparison',
    selector: '#barChart',
    type: 'canvas'
  },
  {
    id: 'budgetChart',
    name: 'Budget Distribution',
    selector: '#budgetChart',
    type: 'canvas'
  },
  {
    id: 'treemap',
    name: 'Market Treemap',
    selector: '#treemap',
    type: 'svg'
  }
];

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Generate filename from chart name
function generateFilename(chartName: string): string {
  return chartName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    + '.jpg';
}

async function generateChartImages() {
  console.log('='.repeat(70));
  console.log('  GENERATING CHART IMAGES FROM MARKET DASHBOARD');
  console.log('='.repeat(70));
  console.log();

  // Check if dashboard file exists
  if (!fs.existsSync(DASHBOARD_HTML)) {
    console.error(`❌ Dashboard file not found: ${DASHBOARD_HTML}`);
    console.error('   Please run "npm run charts" first to generate the dashboard.');
    process.exit(1);
  }

  console.log(`✓ Found dashboard: ${DASHBOARD_HTML}`);
  console.log();

  // Launch browser with larger viewport for tall charts
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 3000 } // Taller viewport for treemap and budget charts
  });
  
  console.log('✓ Browser ready');
  console.log();

  // Create page and load dashboard
  const page = await context.newPage();
  console.log('Loading dashboard...');
  await page.goto(`file://${DASHBOARD_HTML}`, { waitUntil: 'networkidle' });
  
  // Wait for charts to render
  console.log('Waiting for charts to render...');
  
  // Wait for Chart.js to initialize (check for canvas elements with data)
  await page.waitForFunction(() => {
    const canvases = document.querySelectorAll('canvas');
    if (canvases.length === 0) return false;
    
    // Check if Chart.js has rendered by looking for chart instances
    return Array.from(canvases).some(canvas => {
      const chart = (window as any).Chart?.getChart(canvas);
      return chart !== undefined;
    });
  }, { timeout: 15000 }).catch(() => {
    console.log('  ⚠️  Chart.js may not be fully loaded, proceeding anyway...');
  });
  
  // Wait for D3 treemap to render
  await page.waitForFunction(() => {
    const treemap = document.querySelector('#treemap');
    if (!treemap) return false;
    const svg = treemap.querySelector('svg');
    return svg !== null && svg.querySelector('g') !== null;
  }, { timeout: 15000 }).catch(() => {
    console.log('  ⚠️  Treemap may not be fully loaded, proceeding anyway...');
  });
  
  // Additional wait for all rendering to complete
  await page.waitForTimeout(2000);
  
  console.log('✓ Charts rendered');
  console.log();

  // Generate images for each chart
  for (let i = 0; i < CHARTS.length; i++) {
    const chart = CHARTS[i];
    console.log(`[${i + 1}/${CHARTS.length}] Capturing: ${chart.name}`);
    
    try {
      // Find the chart element
      const chartElement = await page.locator(chart.selector).first();
      
      if (await chartElement.count() === 0) {
        console.log(`  ⚠️  Chart element not found: ${chart.selector}`);
        continue;
      }
      
      // Wait for element to be visible
      await chartElement.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      
      // Try to find the parent chart-card container (includes title)
      let containerElement = await chartElement.locator('xpath=ancestor::div[contains(@class, "chart-card")]').first();
      let containerBox = null;
      
      if (await containerElement.count() > 0) {
        await containerElement.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
        containerBox = await containerElement.boundingBox();
      }
      
      // Get bounding box of chart element
      const chartBox = await chartElement.boundingBox();
      
      if (!chartBox || chartBox.width === 0 || chartBox.height === 0) {
        console.log(`  ⚠️  Could not get bounding box for ${chart.name}`);
        continue;
      }
      
      // For tall charts (treemap, budget), check if the actual chart element is taller than container
      // Get the actual rendered size of the chart element (canvas/svg)
      const actualChartSize = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return { width: 0, height: 0 };
        if (el instanceof HTMLCanvasElement) {
          return { width: el.width, height: el.height };
        } else if (el instanceof SVGSVGElement || (el as any).tagName === 'svg') {
          const svg = el as SVGSVGElement;
          const bbox = svg.getBBox();
          return { width: bbox.width || svg.clientWidth, height: bbox.height || svg.clientHeight };
        }
        return { width: el.clientWidth, height: el.clientHeight };
      }, chart.selector);
      
      // Use container if available and valid (includes title), otherwise use chart element
      // But for tall charts, prefer capturing the full chart-card to include title
      const useContainer = containerBox && containerBox.width > 0 && containerBox.height > 0;
      let finalBox = useContainer ? containerBox : chartBox;
      
      // If chart is taller than container, we need to capture more
      // Check if the chart element's actual size exceeds the container
      if (useContainer && containerBox && actualChartSize.height > containerBox.height * 0.8) {
        // Chart might be clipped, try to get the chart-container instead
        const chartContainer = await chartElement.locator('xpath=ancestor::div[contains(@class, "chart-container")]').first();
        if (await chartContainer.count() > 0) {
          const chartContainerBox = await chartContainer.boundingBox();
          if (chartContainerBox && chartContainerBox.height > containerBox.height) {
            // Use the chart-container which might be taller
            finalBox = chartContainerBox;
          }
        }
      }
      
      if (!finalBox) {
        console.log(`  ⚠️  Could not determine bounding box for ${chart.name}`);
        continue;
      }
      
      // Scroll element into view first
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      }, chart.selector);
      
      await page.waitForTimeout(300); // Wait for scroll
      
      // For tall charts, get the actual content height (not just container)
      const contentHeight = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return 0;
        // For canvas, get the canvas height
        if (el instanceof HTMLCanvasElement) {
          return el.height;
        }
        // For SVG, get the viewBox or actual content height
        if (el instanceof SVGSVGElement || (el as any).tagName === 'svg') {
          const svg = el as SVGSVGElement;
          const viewBox = svg.viewBox.baseVal;
          if (viewBox.height > 0) {
            return viewBox.height;
          }
          return svg.clientHeight || svg.getBoundingClientRect().height;
        }
        return el.scrollHeight || el.clientHeight;
      }, chart.selector);
      
      // Re-get bounding box after scroll
      let finalElement = useContainer && containerBox ? containerElement : chartElement;
      let updatedBox = await finalElement.boundingBox();
      
      if (!updatedBox) {
        console.log(`  ⚠️  Could not get updated bounding box for ${chart.name}`);
        continue;
      }
      
      // For budget and treemap charts, use a larger height to capture full content
      // These charts are in "tall" containers (500px) but content might need more space
      if (chart.id === 'budgetChart' || chart.id === 'treemap') {
        const padding = 20;
        const filename = generateFilename(chart.name);
        const outputPath = path.join(OUTPUT_DIR, filename);
        
        // Get the chart-card for full context including title
        const cardBox = containerBox || updatedBox;
        const titleEl = await finalElement.locator('.chart-title').first();
        const titleBox = await titleEl.boundingBox().catch(() => null);
        
        const startY = titleBox ? titleBox.y - padding : (cardBox?.y || updatedBox.y) - padding;
        // Use a larger height: title + 700px for chart content (tall container is 500px, add extra)
        const titleHeight = titleBox ? titleBox.height : 50;
        const chartContentHeight = 700; // Extra space for full chart content
        const fullHeight = chartContentHeight + titleHeight + (padding * 2);
        
        await page.screenshot({
          path: outputPath,
          clip: {
            x: Math.max(0, (cardBox || updatedBox).x - padding),
            y: Math.max(0, startY),
            width: Math.min((cardBox || updatedBox).width + (padding * 2), 1920),
            height: Math.min(fullHeight, 3000)
          },
          type: 'jpeg',
          quality: 95
        });
        
        console.log(`  ✓ Saved: ${filename} (${Math.round((cardBox || updatedBox).width)}x${Math.round(fullHeight)})`);
        continue;
      }
      
      const filename = generateFilename(chart.name);
      const outputPath = path.join(OUTPUT_DIR, filename);
      
      // Use element screenshot which captures the full element
      await finalElement.screenshot({
        path: outputPath,
        type: 'jpeg',
        quality: 95
      });
      
      console.log(`  ✓ Saved: ${filename} (${Math.round(updatedBox.width)}x${Math.round(updatedBox.height)})`);
      
    } catch (error: any) {
      console.error(`  ❌ Error capturing ${chart.name}: ${error.message}`);
    }
    
    console.log();
  }
  
  await browser.close();
  
  console.log('='.repeat(70));
  console.log('  CHART GENERATION COMPLETE');
  console.log('='.repeat(70));
  console.log();
  console.log(`✓ Generated ${CHARTS.length} chart images`);
  console.log(`✓ Output directory: ${OUTPUT_DIR}`);
  console.log();
}

// Run
generateChartImages().catch(console.error);

