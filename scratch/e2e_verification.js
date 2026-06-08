const puppeteer = require('puppeteer-core');

async function test() {
  console.log("Launching Chrome...");
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    defaultViewport: null,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=c:\\Users\\user\\Desktop\\HTK-AI-Capsule`,
      `--load-extension=c:\\Users\\user\\Desktop\\HTK-AI-Capsule`,
      `--user-data-dir=c:\\Users\\user\\Desktop\\HTK-AI-Capsule\\chrome-profile`
    ]
  });
  console.log("Chrome launched successfully!");

  // Wait for targets
  await new Promise(resolve => setTimeout(resolve, 3000));
  const targets = browser.targets();
  const extTarget = targets.find(t => t.url().startsWith('chrome-extension://'));

  if (!extTarget) {
    console.error("No chrome-extension target found. Trying to find ID from chrome://extensions...");
    const page = await browser.newPage();
    await page.goto('chrome://extensions/', { waitUntil: 'networkidle2' });
    // Keep it open for manual review or close
    await new Promise(resolve => setTimeout(resolve, 2000));
    await browser.close();
    return;
  }

  const extId = new URL(extTarget.url()).host;
  console.log("Discovered Extension ID:", extId);

  const welcomeUrl = `chrome-extension://${extId}/welcome.html`;
  console.log("Navigating to welcome page:", welcomeUrl);

  const page = await browser.newPage();
  
  // Listen for console messages
  page.on('console', msg => {
    console.log(`[PAGE CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  // Listen for page errors
  page.on('pageerror', err => {
    console.error(`[PAGE ERROR]:`, err);
  });

  await page.goto(welcomeUrl, { waitUntil: 'networkidle2' });
  console.log("Welcome page loaded!");

  // Check if form elements exist
  const formElements = await page.evaluate(() => {
    return {
      title: document.title,
      h1: document.querySelector('h1')?.textContent,
      tabSignIn: !!document.getElementById('tabSignIn'),
      tabSignUp: !!document.getElementById('tabSignUp'),
      authForm: !!document.getElementById('authForm'),
      btnGoogle: !!document.getElementById('btnGoogle'),
      successSection: !!document.getElementById('successSection')
    };
  });

  console.log("Onboarding Page Elements Check:", formElements);

  // Keep browser open for a few seconds to let any async tasks run
  await new Promise(resolve => setTimeout(resolve, 5000));
  await browser.close();
  console.log("Browser closed. Verification complete!");
}

test().catch(console.error);
