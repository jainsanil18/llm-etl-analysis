import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

interface DiagramInfo {
  title: string;
  code: string;
  type: string;
}

// File paths
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DIAGRAM_MD_FILE = path.join(ROOT_DIR, 'architecture-diagram.md');
const ARCHITECTURE_MD_FILE = path.join(ROOT_DIR, 'ARCHITECTURE.md');
const OUTPUT_DIR = path.join(ROOT_DIR, 'diagrams');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Extract Mermaid diagrams from markdown
function extractDiagrams(markdownContent: string, sourceFile: string): DiagramInfo[] {
  const diagrams: DiagramInfo[] = [];
  
  // More flexible regex to match mermaid code blocks
  // Handles both ```mermaid and ``` mermaid (with space)
  const mermaidRegex = /```\s*mermaid\s*\n([\s\S]*?)```/g;
  
  let match;
  let diagramIndex = 0;
  
  // Find all headings before each diagram
  const headings: { index: number; title: string }[] = [];
  const contentLines = markdownContent.split('\n');
  
  contentLines.forEach((line, index) => {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      headings.push({ index, title: headingMatch[1].trim() });
    }
  });
  
  // Extract diagrams
  while ((match = mermaidRegex.exec(markdownContent)) !== null) {
    const diagramCode = match[1].trim();
    const matchIndex = match.index;
    
    // Find the closest heading before this diagram
    let diagramTitle = `Diagram ${diagramIndex + 1}`;
    const textBeforeMatch = markdownContent.substring(0, matchIndex);
    const linesBeforeMatch = textBeforeMatch.split('\n').length;
    
    // Find the most recent heading before this diagram
    let closestHeading: { index: number; title: string } | null = null;
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].index < linesBeforeMatch) {
        closestHeading = headings[i];
        break;
      }
    }
    
    if (closestHeading) {
      diagramTitle = closestHeading.title;
    } else if (diagramIndex === 0 && headings.length > 0) {
      // If first diagram and no heading found, use first heading
      diagramTitle = headings[0].title;
    }
    
    // Determine diagram type from code
    let diagramType = 'flowchart';
    if (diagramCode.includes('graph ')) {
      diagramType = 'graph';
    } else if (diagramCode.includes('flowchart')) {
      diagramType = 'flowchart';
    } else if (diagramCode.includes('mindmap')) {
      diagramType = 'mindmap';
    }
    
    diagrams.push({
      title: diagramTitle,
      code: diagramCode,
      type: diagramType
    });
    
    diagramIndex++;
  }
  
  return diagrams;
}

// Create HTML page for a single diagram
function createDiagramHTML(diagramCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mermaid Diagram</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 60px;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
      width: 100%;
    }
    .mermaid {
      background: white;
      display: block;
      width: 100%;
      max-width: 100%;
    }
    .mermaid svg {
      width: 100%;
      height: auto;
      max-width: 100%;
    }
  </style>
</head>
<body>
  <div class="mermaid">
${diagramCode}
  </div>
  <script>
    mermaid.initialize({ 
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis'
      },
      themeVariables: {
        primaryColor: '#fff',
        primaryTextColor: '#000',
        primaryBorderColor: '#000',
        lineColor: '#000',
        secondaryColor: '#f0f0f0',
        tertiaryColor: '#e0e0e0'
      }
    });
    
    // Wait for diagram to render
    let renderAttempts = 0;
    const maxAttempts = 20;
    
    function checkRender() {
      const svg = document.querySelector('.mermaid svg');
      if (svg && svg.querySelector('g')) {
        window.diagramReady = true;
      } else {
        renderAttempts++;
        if (renderAttempts < maxAttempts) {
          setTimeout(checkRender, 200);
        } else {
          window.diagramReady = true; // Timeout, proceed anyway
        }
      }
    }
    
    window.addEventListener('load', () => {
      setTimeout(checkRender, 500);
    });
  </script>
</body>
</html>`;
}

// Generate filename from title
function generateFilename(title: string, index: number): string {
  // Clean title for filename
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  
  return `${String(index + 1).padStart(2, '0')}-${cleanTitle}.jpg`;
}

async function generateDiagramImages() {
  console.log('='.repeat(70));
  console.log('  GENERATING DIAGRAM IMAGES');
  console.log('='.repeat(70));
  console.log();

  // Read markdown files
  console.log('Reading markdown files...');
  let allDiagrams: DiagramInfo[] = [];
  
  if (fs.existsSync(DIAGRAM_MD_FILE)) {
    const diagramContent = fs.readFileSync(DIAGRAM_MD_FILE, 'utf-8');
    const diagrams = extractDiagrams(diagramContent, 'architecture-diagram.md');
    allDiagrams = allDiagrams.concat(diagrams);
    console.log(`✓ Found ${diagrams.length} diagrams in architecture-diagram.md`);
  }
  
  if (fs.existsSync(ARCHITECTURE_MD_FILE)) {
    const archContent = fs.readFileSync(ARCHITECTURE_MD_FILE, 'utf-8');
    const diagrams = extractDiagrams(archContent, 'ARCHITECTURE.md');
    allDiagrams = allDiagrams.concat(diagrams);
    console.log(`✓ Found ${diagrams.length} diagrams in ARCHITECTURE.md`);
  }
  
  if (allDiagrams.length === 0) {
    console.error('❌ No Mermaid diagrams found!');
    process.exit(1);
  }
  
  console.log(`✓ Total: ${allDiagrams.length} diagrams to generate`);
  console.log();

  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 2400, height: 1600 }
  });
  
  console.log('✓ Browser ready');
  console.log();

  // Generate images for each diagram
  for (let i = 0; i < allDiagrams.length; i++) {
    const diagram = allDiagrams[i];
    console.log(`[${i + 1}/${allDiagrams.length}] Generating: ${diagram.title}`);
    
    try {
      // Create HTML file
      const htmlContent = createDiagramHTML(diagram.code);
      const htmlPath = path.join(OUTPUT_DIR, `temp_${i}.html`);
      fs.writeFileSync(htmlPath, htmlContent);
      
      // Create page and load diagram
      const page = await context.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
      
      // Wait for Mermaid to render
      try {
        await page.waitForFunction(() => {
          return (window as any).diagramReady === true;
        }, { timeout: 15000 });
      } catch (e) {
        console.log(`  ⚠️  Timeout waiting for diagram, proceeding anyway...`);
      }
      
      // Additional wait for rendering to complete
      await page.waitForTimeout(1500);
      
      // Find the mermaid diagram element
      const diagramElement = await page.locator('.mermaid svg').first();
      
      if (await diagramElement.count() > 0) {
        // Wait for SVG to be visible
        await diagramElement.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        
        // Get bounding box of the SVG
        const box = await diagramElement.boundingBox();
        
        if (box && box.width > 0 && box.height > 0) {
          // Take screenshot of the diagram with padding
          const padding = 40;
          const filename = generateFilename(diagram.title, i);
          const outputPath = path.join(OUTPUT_DIR, filename);
          
          // Ensure we capture the full diagram
          const clipX = Math.max(0, box.x - padding);
          const clipY = Math.max(0, box.y - padding);
          const clipWidth = Math.min(box.width + (padding * 2), 2400 - clipX);
          const clipHeight = Math.min(box.height + (padding * 2), 1600 - clipY);
          
          await page.screenshot({
            path: outputPath,
            clip: {
              x: clipX,
              y: clipY,
              width: clipWidth,
              height: clipHeight
            },
            type: 'jpeg',
            quality: 95
          });
          
          console.log(`  ✓ Saved: ${filename} (${Math.round(box.width)}x${Math.round(box.height)})`);
        } else {
          // Fallback: screenshot entire page
          const filename = generateFilename(diagram.title, i);
          const outputPath = path.join(OUTPUT_DIR, filename);
          await page.screenshot({
            path: outputPath,
            type: 'jpeg',
            quality: 95,
            fullPage: true
          });
          console.log(`  ✓ Saved (full page fallback): ${filename}`);
        }
      } else {
        // Fallback: screenshot entire page
        const filename = generateFilename(diagram.title, i);
        const outputPath = path.join(OUTPUT_DIR, filename);
        await page.screenshot({
          path: outputPath,
          type: 'jpeg',
          quality: 95,
          fullPage: true
        });
        console.log(`  ✓ Saved (full page): ${filename}`);
      }
      
      await page.close();
      
      // Clean up temp HTML file
      fs.unlinkSync(htmlPath);
      
    } catch (error: any) {
      console.error(`  ❌ Error generating ${diagram.title}: ${error.message}`);
    }
    
    console.log();
  }
  
  await browser.close();
  
  console.log('='.repeat(70));
  console.log('  DIAGRAM GENERATION COMPLETE');
  console.log('='.repeat(70));
  console.log();
  console.log(`✓ Generated ${allDiagrams.length} diagram images`);
  console.log(`✓ Output directory: ${OUTPUT_DIR}`);
  console.log();
}

// Run
generateDiagramImages().catch(console.error);

