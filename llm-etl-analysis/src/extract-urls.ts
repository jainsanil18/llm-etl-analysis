import * as fs from 'fs';
import * as path from 'path';

interface Email {
  Body?: string;
  [key: string]: any;
}

// Paths
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_RAW = path.join(ROOT_DIR, 'data', 'raw');
const DATA_PROCESSED = path.join(ROOT_DIR, 'data', 'processed');

// Configuration: URL pattern (can be made configurable via config file)
// Default pattern matches job URLs with ~ followed by ID and ?link=new_job
const URL_PATTERN = process.env.URL_PATTERN || 
  'https://[^/]+\\.com/jobs/~[^?\\s"<>]+?\\?link=new_job[^"\\s<>]*';

// Input/Output
const inputFilename = path.join(DATA_PROCESSED, 'filtered_emails.json');
const outputFilename = path.join(DATA_RAW, 'job_urls.json');

/**
 * Extract URLs matching the pattern from email bodies
 * @param emails Array of email objects
 * @param pattern Regex pattern string for matching URLs
 * @returns Array of unique URLs
 */
function extractUrls(emails: Email[], pattern: string): string[] {
  const urlRegex = new RegExp(pattern, 'gi');
  const jobUrls: string[] = [];
  const seen = new Set<string>();

  for (const email of emails) {
    const body = email.Body || '';
    if (!body) continue;

    const matches = body.match(urlRegex);
    if (matches) {
      for (const url of matches) {
        // Clean up the URL - extract just up to ?link=new_job
        let cleanUrl = url;
        if (url.includes('?link=new_job')) {
          cleanUrl = url.split('?link=new_job')[0] + '?link=new_job';
        }

        // Remove duplicates while preserving order
        if (!seen.has(cleanUrl)) {
          seen.add(cleanUrl);
          jobUrls.push(cleanUrl);
        }
      }
    }
  }

  return jobUrls;
}

async function extractJobUrls() {
  console.log('='.repeat(70));
  console.log('  EXTRACTING JOB URLS FROM EMAILS');
  console.log('='.repeat(70));
  console.log();

  try {
    // Check if input file exists
    if (!fs.existsSync(inputFilename)) {
      console.error(`❌ Error: Could not find '${inputFilename}'`);
      console.error('   Run "npm run filter-emails" first to generate filtered emails.');
      process.exit(1);
    }

    // Load filtered emails
    console.log(`Loading filtered emails from ${inputFilename}...`);
    const emailsContent = fs.readFileSync(inputFilename, 'utf-8');
    const emails: Email[] = JSON.parse(emailsContent);
    console.log(`✓ Loaded ${emails.length} emails`);
    console.log();

    // Extract URLs
    console.log(`Extracting URLs matching pattern: ${URL_PATTERN.substring(0, 50)}...`);
    const jobUrls = extractUrls(emails, URL_PATTERN);
    console.log(`✓ Extracted ${jobUrls.length} unique URLs`);
    console.log();

    // Ensure output directory exists
    const outputDir = path.dirname(outputFilename);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save URLs
    fs.writeFileSync(
      outputFilename,
      JSON.stringify(jobUrls, null, 2),
      'utf-8'
    );

    console.log('='.repeat(70));
    console.log('  URL EXTRACTION COMPLETE');
    console.log('='.repeat(70));
    console.log();
    console.log(`✓ Saved ${jobUrls.length} unique job URLs`);
    console.log(`✓ Output: ${outputFilename}`);
    console.log();

    if (jobUrls.length > 0) {
      console.log('First 5 URLs:');
      jobUrls.slice(0, 5).forEach((url, i) => {
        console.log(`  ${i + 1}. ${url}`);
      });
      console.log();
    }

    console.log('Note: Set URL_PATTERN environment variable to use a different pattern.');
    console.log('Example: URL_PATTERN="https://example.com/jobs/[^\\s]+" npm run extract-urls');
    console.log();

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Error: Could not find '${inputFilename}'`);
      console.error('   Run "npm run filter-emails" first to generate filtered emails.');
    } else if (error instanceof SyntaxError) {
      console.error(`❌ Error: '${inputFilename}' is not a valid JSON file.`);
      console.error(`   ${error.message}`);
    } else {
      console.error(`❌ Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Run
extractJobUrls();

