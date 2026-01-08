import * as fs from 'fs';
import * as path from 'path';

interface Email {
  From?: string;
  Body?: string;
  [key: string]: any;
}

// Paths
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_RAW = path.join(ROOT_DIR, 'data', 'raw');
const DATA_PROCESSED = path.join(ROOT_DIR, 'data', 'processed');

// Configuration: sender filter pattern (configurable via environment variable)
const SENDER_FILTER = process.env.SENDER_FILTER || 'example';

// Input/Output
const inputFilename = path.join(DATA_RAW, 'emails.json');
const outputFilename = path.join(DATA_PROCESSED, 'filtered_emails.json');

/**
 * Filter emails by sender pattern
 * @param emails Array of email objects
 * @param filterPattern Pattern to match in sender field (case-insensitive)
 * @returns Filtered array of emails
 */
function filterEmails(emails: Email[], filterPattern: string): Email[] {
  return emails.filter(email => {
    const sender = email.From || '';
    return sender.toLowerCase().includes(filterPattern.toLowerCase());
  });
}

async function filterEmailsBySender() {
  console.log('='.repeat(70));
  console.log('  FILTERING EMAILS BY SENDER');
  console.log('='.repeat(70));
  console.log();

  try {
    // Check if input file exists
    if (!fs.existsSync(inputFilename)) {
      console.error(`❌ Error: Could not find '${inputFilename}'`);
      console.error('   Make sure emails.json is in the data/raw/ directory.');
      process.exit(1);
    }

    // Load emails
    console.log(`Loading emails from ${inputFilename}...`);
    const emailsContent = fs.readFileSync(inputFilename, 'utf-8');
    const emails: Email[] = JSON.parse(emailsContent);
    console.log(`✓ Loaded ${emails.length} emails`);
    console.log();

    // Filter emails
    console.log(`Filtering emails where sender contains '${SENDER_FILTER}'...`);
    const filteredEmails = filterEmails(emails, SENDER_FILTER);
    console.log(`✓ Found ${filteredEmails.length} matching emails`);
    console.log();

    // Ensure output directory exists
    const outputDir = path.dirname(outputFilename);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save filtered emails
    fs.writeFileSync(
      outputFilename,
      JSON.stringify(filteredEmails, null, 2),
      'utf-8'
    );

    console.log('='.repeat(70));
    console.log('  FILTERING COMPLETE');
    console.log('='.repeat(70));
    console.log();
    console.log(`✓ Saved ${filteredEmails.length} filtered emails`);
    console.log(`✓ Output: ${outputFilename}`);
    console.log();
    console.log('Note: Set SENDER_FILTER environment variable to filter by different sender.');
    console.log('Example: SENDER_FILTER=example npm run filter-emails');
    console.log();

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Error: Could not find '${inputFilename}'`);
      console.error('   Make sure emails.json is in the data/raw/ directory.');
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
filterEmailsBySender();

