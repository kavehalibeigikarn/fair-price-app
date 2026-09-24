// Runs after `npx cap add android`: installs MainActivity and adds share/view intent filters.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "android", "app", "src", "main");
fs.copyFileSync(path.join(__dirname, "MainActivity.java"), path.join(root, "java", "ir", "kaveh", "fairprice", "MainActivity.java"));
const mf = path.join(root, "AndroidManifest.xml");
let x = fs.readFileSync(mf, "utf8");
const filters = `
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="divar.ir" android:pathPrefix="/v/" />
            </intent-filter>`;
if (!x.includes("android.intent.action.SEND")) {
  x = x.replace(/(<category android:name="android.intent.category.LAUNCHER"\s*\/>\s*<\/intent-filter>)/, `$1${filters}`);
  x = x.replace(/android:launchMode="[^"]*"/, 'android:launchMode="singleTask"');
  fs.writeFileSync(mf, x);
}
console.log("android patched");
