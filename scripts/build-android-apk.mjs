import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { env } from 'node:process';

function runCommand(command, cwd = process.cwd()) {
  console.log(`\n> Executing: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', cwd, env: { ...env, JAVA_HOME: env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr', ANDROID_HOME: env.ANDROID_HOME || 'C:\\Users\\Maicon\\AppData\\Local\\Android\\Sdk' } });
  } catch (error) {
    console.error(`\n[ERROR] Command failed: ${command}`);
    process.exit(1);
  }
}

console.log('--- BUILD ANDROID APK ---');

// 1. Run tests
runCommand('npm run test');

// 2. Run typecheck
runCommand('npm run typecheck');

// 3. Build Web
runCommand('npm run build');

// 4. Sync Capacitor
runCommand('npx cap sync android');

// 5. Build APK
const androidDir = resolve('android');
const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
runCommand(`${gradlewCmd} assembleDebug`, androidDir);

// 6. Verify and Copy APK
const originalApkPath = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

if (!existsSync(originalApkPath)) {
  console.error(`\n[ERROR] APK not found at expected path: ${originalApkPath}`);
  process.exit(1);
}

const releaseDir = resolve('release-android');
if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
}

const finalApkName = 'Rua-de-Aco-Beta-0.1.0.apk';
const finalApkPath = join(releaseDir, finalApkName);

copyFileSync(originalApkPath, finalApkPath);

// 7. Calculate SHA-256 and Size
const stats = statSync(finalApkPath);
if (stats.size === 0) {
  console.error('\n[ERROR] APK size is 0 bytes.');
  process.exit(1);
}

const fileBuffer = readFileSync(finalApkPath);
const hashSum = createHash('sha256');
hashSum.update(fileBuffer);
const hex = hashSum.digest('hex');

// 8. Output details
console.log('\n--- BUILD SUCCESS ---');
console.log(`APK gerado com sucesso!`);
console.log(`Caminho absoluto: ${finalApkPath}`);
console.log(`Tamanho: ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size} bytes)`);
console.log(`SHA-256: ${hex}`);
console.log(`Package ID: com.mikerock12.ruadeaco`);
console.log(`Version Name: 0.1.0-beta.1`);
console.log(`Version Code: 1`);
console.log(`Assinatura: Debug automatizada`);
console.log('\nVocê pode testar localmente ou instalar no dispositivo Android.');
