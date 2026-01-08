import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config();

// Configurable delays (in milliseconds)
const CONFIG = {
  AFTER_NAVIGATION_WAIT: 3000,
  AFTER_EXPAND_WAIT: 2000,
  DELAY_BETWEEN_JOBS: 5000,
};

interface ExtractedJobData {
  jobTitle: string;
  budget: string;
  postedTime: string;
  description: string;
  url: string;
  scrapedAt: string;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function expandAllContent(page: any): Promise<void> {
  try {
    const expandSelectors = [
      'button:has-text("View more")',
      'button:has-text("view more")',
      'a:has-text("View more")',
      'a:has-text("view more")',
      'button:has-text("Show more")',
      'a:has-text("Show more")',
    ];

    let foundElements = [];

    for (const selector of expandSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            foundElements.push({ selector, element });
          }
        }
      } catch (err) {
        // Continue
      }
    }

    if (foundElements.length > 0) {
      console.log(`\n⚠️  Found ${foundElements.length} "View More" button(s) - expanding automatically...`);

      for (const item of foundElements) {
        try {
          await item.element.click({ timeout: 2000 });
          await page.waitForTimeout(1000);
        } catch (err) {
          // Continue
        }
      }
      console.log('✓ Expanded all content');
      await page.waitForTimeout(CONFIG.AFTER_EXPAND_WAIT);
    } else {
      console.log('  No "View More" buttons found');
    }
  } catch (error: any) {
    console.log(`  Error: ${error.message}`);
  }
}

async function extractJobDataWithHTML(page: any, url: string): Promise<ExtractedJobData> {
  try {
    console.log('Extracting with HTML selectors...');

    // Extract job title
    const titleSelectors = ['h1', 'h2', '[data-test="job-tile-title"]', '.job-title', '[class*="JobTitle"]'];
    let jobTitle = 'N/A';
    for (const sel of titleSelectors) {
      const text = await page.textContent(sel, { timeout: 2000 }).catch(() => null);
      if (text?.trim()) {
        jobTitle = text.trim();
        break;
      }
    }

    // Extract budget
    const budgetSelectors = ['[class*="budget"]', '[class*="Budget"]', '[class*="price"]', '[class*="Price"]'];
    let budget = 'N/A';
    for (const sel of budgetSelectors) {
      const text = await page.textContent(sel, { timeout: 2000 }).catch(() => null);
      if (text?.trim()) {
        budget = text.trim();
        break;
      }
    }

    // Extract posted time
    const timeSelectors = ['[class*="posted"]', '[class*="Posted"]', '[class*="time"]', 'time'];
    let postedTime = 'N/A';
    for (const sel of timeSelectors) {
      const text = await page.textContent(sel, { timeout: 2000 }).catch(() => null);
      if (text?.trim()) {
        postedTime = text.trim();
        break;
      }
    }

    // Extract description
    const descSelectors = ['[class*="description"]', '[class*="Description"]', 'article', 'main'];
    let description = 'N/A';
    for (const sel of descSelectors) {
      const text = await page.textContent(sel, { timeout: 2000 }).catch(() => null);
      if (text?.trim() && text.length > 50) {
        description = text.trim();
        break;
      }
    }

    console.log('✓ HTML extraction complete');

    return {
      jobTitle,
      budget,
      postedTime,
      description,
      url,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.log(`⚠️  HTML extraction failed: ${error.message}`);
    return {
      jobTitle: 'N/A',
      budget: 'N/A',
      postedTime: 'N/A',
      description: 'N/A',
      url,
      scrapedAt: new Date().toISOString(),
    };
  }
}

async function extractJobDataWithAI(page: any, url: string): Promise<ExtractedJobData> {
  try {
    const html = await page.content();
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      console.log('⚠️  No OPENAI_API_KEY - using N/A values');
      return {
        jobTitle: 'N/A',
        budget: 'N/A',
        postedTime: 'N/A',
        description: 'N/A',
        url,
        scrapedAt: new Date().toISOString(),
      };
    }

    console.log('Using AI to extract data...');

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
            content: 'Extract job listing information from HTML and return ONLY a JSON object.',
          },
          {
            role: 'user',
            content: `Extract these fields from this job listing:
- jobTitle: The job title
- budget: Budget/hourly rate
- postedTime: When posted
- description: Full job description

HTML:
${html.substring(0, 30000)}

Return ONLY JSON. If field not found, use "N/A".`,
          },
        ],
        temperature: 0.1,
      }),
    });

    const data = await response.json();
    let content = data.choices[0].message.content;

    // Strip markdown code blocks if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const extracted = JSON.parse(content);

    console.log('✓ AI extraction complete');

    return {
      jobTitle: extracted.jobTitle || 'N/A',
      budget: extracted.budget || 'N/A',
      postedTime: extracted.postedTime || 'N/A',
      description: extracted.description || 'N/A',
      url,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.log(`⚠️  AI failed: ${error.message}`);
    return {
      jobTitle: 'N/A',
      budget: 'N/A',
      postedTime: 'N/A',
      description: 'N/A',
      url,
      scrapedAt: new Date().toISOString(),
    };
  }
}

async function scrapeAllJobs() {
  console.log('='.repeat(70));
  console.log('  JOB SCRAPER - Complete Workflow');
  console.log('='.repeat(70));
  console.log('\n');

// Paths
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_RAW = path.join(ROOT_DIR, 'data', 'raw');
const DATA_PROCESSED = path.join(ROOT_DIR, 'data', 'processed');
const DATA_SCREENSHOTS = path.join(ROOT_DIR, 'data', 'screenshots');

// Ensure output directories exist
fs.mkdirSync(DATA_PROCESSED, { recursive: true });
fs.mkdirSync(DATA_SCREENSHOTS, { recursive: true });

// Read job URLs
const jobUrlsFile = path.join(DATA_RAW, 'job_urls.json');
if (!fs.existsSync(jobUrlsFile)) {
  console.error(`❌ job_urls.json not found at ${jobUrlsFile}!`);
  process.exit(1);
}

const jobUrls: string[] = JSON.parse(fs.readFileSync(jobUrlsFile, 'utf-8'));
  console.log(`📋 Found ${jobUrls.length} job(s) to scrape\n`);

  // Connect to browser
  let browser: any = null;
  const portsToTry = [9222, 9223, 9224, 9229];

  console.log('🔌 Connecting to browser via CDP...');
  for (const port of portsToTry) {
    try {
      browser = await chromium.connectOverCDP(`http://localhost:${port}`);
      console.log(`✓ Connected on port ${port}\n`);
      break;
    } catch (err) {
      // Try next port
    }
  }

  if (!browser) {
    console.error('❌ Could not connect to browser!');
    console.error('Make sure Brave/Chrome is running with:');
    console.error('"C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" --remote-debugging-port=9222');
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('❌ No browser contexts found');
    await browser.close();
    process.exit(1);
  }

  const context = contexts[0];
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  const resultsAI: ExtractedJobData[] = [];
  const resultsHTML: ExtractedJobData[] = [];
  let successCount = 0;
  let failCount = 0;

  // Output file paths
  const outputFileAI = path.join(DATA_PROCESSED, 'scraped_jobs_ai.json');
  const outputFileHTML = path.join(DATA_PROCESSED, 'scraped_jobs_html.json');

  // Load existing results if files exist
  if (fs.existsSync(outputFileAI)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(outputFileAI, 'utf-8'));
      resultsAI.push(...existingData);
      console.log(`📂 Loaded ${existingData.length} existing AI job(s) from ${outputFileAI}`);
    } catch (e) {
      console.log(`⚠️  Could not load existing AI data, starting fresh`);
    }
  }

  if (fs.existsSync(outputFileHTML)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(outputFileHTML, 'utf-8'));
      resultsHTML.push(...existingData);
      console.log(`📂 Loaded ${existingData.length} existing HTML job(s) from ${outputFileHTML}`);
    } catch (e) {
      console.log(`⚠️  Could not load existing HTML data, starting fresh`);
    }
  }

  console.log();

  // Process each job
  for (let i = 0; i < jobUrls.length; i++) {
    const url = jobUrls[i];
    const jobNum = i + 1;

    console.log('\n' + '='.repeat(70));
    console.log(`  JOB ${jobNum}/${jobUrls.length}`);
    console.log('='.repeat(70));
    console.log(`URL: ${url}`);
    console.log(`Time: ${new Date().toLocaleTimeString()}\n`);

    const startTime = Date.now();

    try {
      // Navigate
      console.log('Navigating...');
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      console.log('✓ Page loaded');

      await page.waitForTimeout(CONFIG.AFTER_NAVIGATION_WAIT);

      // Check for Cloudflare
      const bodyText = await page.textContent('body').catch(() => '') || '';
      const hasCloudflare = bodyText.includes('Just a moment') ||
                            bodyText.includes('Checking your browser') ||
                            bodyText.includes('Verify you are human');

      if (hasCloudflare) {
        console.log('\n⚠️  Cloudflare challenge detected');
        const answer = await askUser('Solve manually, then press Enter to continue: ');
        await page.waitForTimeout(2000);
      }

      // Check if this is a private listing
      const isPrivateListing = bodyText.toLowerCase().includes('this job is a private listing') ||
                               bodyText.toLowerCase().includes('this is a private job') ||
                               bodyText.toLowerCase().includes('private listing');

      if (isPrivateListing) {
        console.log('\n⚠️  This is a private listing - skipping');
        console.log(`✓ Job ${jobNum} skipped (private listing)`);

        const privateData = {
          jobTitle: 'PRIVATE LISTING',
          budget: 'PRIVATE',
          postedTime: 'PRIVATE',
          description: 'This job is a private listing and cannot be scraped',
          url,
          scrapedAt: new Date().toISOString(),
        };

        resultsAI.push(privateData);
        resultsHTML.push(privateData);

        // Save immediately to both files
        fs.writeFileSync(outputFileAI, JSON.stringify(resultsAI, null, 2));
        fs.writeFileSync(outputFileHTML, JSON.stringify(resultsHTML, null, 2));
        console.log(`💾 Saved to: ${outputFileAI} and ${outputFileHTML}`);

        // Delay before next job
        if (i < jobUrls.length - 1) {
          console.log(`\nWaiting ${CONFIG.DELAY_BETWEEN_JOBS / 1000}s before next job...`);
          await page.waitForTimeout(CONFIG.DELAY_BETWEEN_JOBS);
        }
        continue;
      }

      // Check for View More
      await expandAllContent(page);

      // Take screenshot
      const screenshotPath = path.join(DATA_SCREENSHOTS, `job_${jobNum}_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
      console.log(`📸 Screenshot: ${screenshotPath}`);

      // Extract data using BOTH methods
      console.log('\nExtracting data with both methods...');

      const jobDataAI = await extractJobDataWithAI(page, page.url());
      const jobDataHTML = await extractJobDataWithHTML(page, page.url());

      console.log('\n--- AI Extracted Data ---');
      console.log(`Title: ${jobDataAI.jobTitle}`);
      console.log(`Budget: ${jobDataAI.budget}`);
      console.log(`Posted: ${jobDataAI.postedTime}`);
      console.log(`Description: ${jobDataAI.description.substring(0, 100)}...`);

      console.log('\n--- HTML Extracted Data ---');
      console.log(`Title: ${jobDataHTML.jobTitle}`);
      console.log(`Budget: ${jobDataHTML.budget}`);
      console.log(`Posted: ${jobDataHTML.postedTime}`);
      console.log(`Description: ${jobDataHTML.description.substring(0, 100)}...`);

      resultsAI.push(jobDataAI);
      resultsHTML.push(jobDataHTML);
      successCount++;

      // Save immediately after each job to both files
      fs.writeFileSync(outputFileAI, JSON.stringify(resultsAI, null, 2));
      fs.writeFileSync(outputFileHTML, JSON.stringify(resultsHTML, null, 2));
      console.log(`💾 Saved to: ${outputFileAI} and ${outputFileHTML}`);

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ Job ${jobNum} completed in ${elapsedTime}s`);

      // Delay between jobs
      if (i < jobUrls.length - 1) {
        console.log(`\nWaiting ${CONFIG.DELAY_BETWEEN_JOBS / 1000}s before next job...`);
        await page.waitForTimeout(CONFIG.DELAY_BETWEEN_JOBS);
      }

    } catch (error: any) {
      console.error(`\n❌ Job ${jobNum} failed: ${error.message}`);
      failCount++;

      // Still add to results with error info
      const errorData = {
        jobTitle: 'ERROR',
        budget: 'ERROR',
        postedTime: 'ERROR',
        description: `Failed: ${error.message}`,
        url,
        scrapedAt: new Date().toISOString(),
      };

      resultsAI.push(errorData);
      resultsHTML.push(errorData);

      // Save immediately to both files
      fs.writeFileSync(outputFileAI, JSON.stringify(resultsAI, null, 2));
      fs.writeFileSync(outputFileHTML, JSON.stringify(resultsHTML, null, 2));
      console.log(`💾 Saved error to: ${outputFileAI} and ${outputFileHTML}`);
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('  SCRAPING COMPLETE');
  console.log('='.repeat(70));
  console.log(`Total jobs: ${jobUrls.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`\n💾 Results saved to:`);
  console.log(`   AI Extraction: ${outputFileAI}`);
  console.log(`   HTML Extraction: ${outputFileHTML}`);
  console.log('='.repeat(70));

  await browser.close();
  rl.close();
}

// Run
scrapeAllJobs()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    rl.close();
    process.exit(1);
  });
