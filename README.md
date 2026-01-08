# LLM Data Extraction & Clustering Pipeline

An end-to-end TypeScript pipeline for extracting structured data from web sources using LLMs, generating semantic embeddings, and performing K-means clustering to reveal market trends and patterns.

## Overview

This pipeline combines:
- **LLM-Powered Extraction**: Uses OpenAI GPT-4o-mini to extract structured information from HTML pages
- **Semantic Embeddings**: Generates 1536-dimensional vectors using OpenAI's text-embedding-3-small model
- **K-means Clustering**: Discovers market trends, categories, and patterns using optimized clustering
- **Interactive Visualization**: Generates beautiful dashboards with charts and treemaps

## Architecture

```
Email/URL Sources
    ↓
Data Extraction (LLM + HTML)
    ↓
Structured JSON Data
    ↓
Semantic Embeddings (OpenAI)
    ↓
K-means Clustering
    ↓
Market Insights & Visualization
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## Features

- 🤖 **LLM-Powered Extraction**: Intelligent data extraction from HTML using GPT-4o-mini
- 🧠 **Semantic Embeddings**: Capture job semantics with OpenAI embeddings
- 📊 **K-means Clustering**: Discover market patterns with silhouette score optimization
- 💡 **Automated Insights**: Categories, budgets, trends automatically identified
- 📈 **Interactive Dashboards**: Beautiful visualizations with Chart.js and D3.js
- 🔧 **TypeScript-Only**: Modern, type-safe codebase

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key
- Playwright browsers

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/llm-data-extraction-clustering.git
   cd llm-data-extraction-clustering
   ```

2. **Install dependencies**:
   ```bash
   cd llm-etl-analysis
   npm install
   npx playwright install chromium
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

### CDP Setup (Chrome DevTools Protocol)

The scraper can connect to a manually launched browser via CDP for better automation detection bypass. This is recommended for scraping sites with anti-bot protection.

**Windows:**

1. **Chrome:**
   ```bash
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome_profile_cdp"
   ```

2. **Brave:**
   ```bash
   "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\brave_profile_cdp"
   ```

3. **Edge:**
   ```bash
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\edge_profile_cdp"
   ```

**Ubuntu/Linux:**

1. **Chrome:**
   ```bash
   google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome_profile_cdp
   ```

2. **Chromium:**
   ```bash
   chromium-browser --remote-debugging-port=9222 --user-data-dir=/tmp/chromium_profile_cdp
   ```

3. **Brave:**
   ```bash
   brave-browser --remote-debugging-port=9222 --user-data-dir=/tmp/brave_profile_cdp
   ```

**macOS:**

1. **Chrome:**
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome_profile_cdp
   ```

2. **Brave:**
   ```bash
   /Applications/Brave\ Browser.app/Contents/MacOS/Brave\ Browser --remote-debugging-port=9222 --user-data-dir=/tmp/brave_profile_cdp
   ```

3. **Edge:**
   ```bash
   /Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge --remote-debugging-port=9222 --user-data-dir=/tmp/edge_profile_cdp
   ```

**Notes:**
- The scraper will automatically try ports: `9222`, `9223`, `9224`, `9229`
- Close all other browser windows before launching with CDP
- The `--user-data-dir` flag creates a separate profile to avoid conflicts
- After launching the browser, run `npm run scrape` in a separate terminal
- The browser window will remain open and visible during scraping

### Basic Usage

1. **Prepare your data**:
   - Place `emails.json` in `data/raw/` (optional, for email processing)
   - Or create `data/raw/job_urls.json` with an array of URLs

2. **Process emails** (optional):
   ```bash
   npm run filter-emails    # Filter emails by sender
   npm run extract-urls     # Extract job URLs from emails
   ```

3. **Scrape job pages**:
   ```bash
   npm run scrape           # Scrape jobs from job_urls.json
   ```
   
   **Tip**: For better automation detection bypass, launch your browser with CDP first (see CDP Setup section above), then run the scraper.

4. **Analyze with ML**:
   ```bash
   npm run analyze          # Generate embeddings and cluster analysis
   npm run subcluster       # Deep dive into specific clusters (optional)
   ```

5. **Generate visualizations**:
   ```bash
   npm run charts           # Generate interactive dashboard
   npm run chart-images     # Export chart images as JPG
   ```

## Project Structure

```
.
├── llm-etl-analysis/        # Main TypeScript codebase
│   ├── src/
│   │   ├── filter-emails.ts      # Email filtering
│   │   ├── extract-urls.ts        # URL extraction
│   │   ├── scrape-all.ts           # Web scraping
│   │   ├── analyze-jobs.ts         # ML clustering
│   │   ├── generate-charts.ts      # Dashboard generation
│   │   └── ...
│   └── package.json
├── examples/                # Example code and configurations
├── data/                    # Data files (gitignored)
│   ├── raw/                # Input data
│   ├── processed/          # Processed data
│   └── screenshots/        # Screenshots
├── charts/                 # Generated chart images
├── diagrams/                # Architecture diagrams
├── ARCHITECTURE.md          # Architecture documentation
├── CONTRIBUTING.md          # Contribution guidelines
└── LICENSE                  # MIT License
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=sk-your-key-here
SENDER_FILTER=example          # Optional: email sender filter
URL_PATTERN=https://...        # Optional: URL extraction pattern
```

## Workflow

1. **Data Collection**: Extract URLs from emails or provide directly
2. **Web Scraping**: Scrape HTML pages using Playwright
   - **Recommended**: Launch browser with CDP (see CDP Setup section) for better automation detection bypass
   - **Alternative**: Scraper can run in headless mode, but may be more easily detected
3. **LLM Extraction**: Extract structured data using GPT-4o-mini
4. **Embedding Generation**: Create semantic vectors with OpenAI
5. **Clustering**: Discover patterns with K-means (silhouette score optimization)
6. **Visualization**: Generate interactive dashboards and chart images

**Notes:**
- Private listings are automatically detected and skipped
- Cloudflare challenges may require manual intervention
- CDP connection allows the scraper to control a real browser instance, making it harder to detect as automated

## Output Files

**Scraping:**
- `data/processed/scraped_jobs_ai.json` - AI-extracted job data
- `data/processed/scraped_jobs_html.json` - HTML-selector extracted job data
- `data/screenshots/job_*.png` - Screenshots of job pages

**Analysis:**
- `data/processed/job_embeddings.json` - Semantic embeddings
- `data/processed/cluster_analysis.json` - Clustering results
- `data/processed/subcluster_analysis.json` - Sub-clustering results (optional)

**Visualization:**
- `llm-etl-analysis/market-dashboard.html` - Interactive dashboard
- `charts/*.jpg` - Chart images
- `diagrams/*.jpg` - Architecture diagram images

## Examples

See the `examples/` directory for:
- Platform-specific configurations
- Custom extraction patterns

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

## Technologies

- **TypeScript** - Type-safe JavaScript
- **Playwright** - Browser automation
- **OpenAI API** - LLM and embeddings
- **ml-kmeans** - K-means clustering
- **Chart.js** - Chart visualization
- **D3.js** - Treemap visualization

## License

MIT License - see [LICENSE](LICENSE) for details

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

Open an issue for questions, bug reports, or feature requests.
