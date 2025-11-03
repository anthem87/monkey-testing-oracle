/**
 * Test script for BuildToolAdapter detection
 */
import { detectBuildTool } from './core/build-tool-adapter.js';

async function test() {
  console.log('🔍 Testing BuildToolAdapter detection...\n');

  // Test 1: Maven project
  const mavenProject = '/home/amennillo/mit/documentale-be/core/desk/proxy-security';
  console.log(`Testing: ${mavenProject}`);
  const mavenAdapter = await detectBuildTool(mavenProject);
  
  if (mavenAdapter) {
    console.log('✅ Detected build tool: Maven');
    
    // Try to compile
    console.log('\n📦 Running Maven compile...');
    const compileResult = await mavenAdapter.compile(mavenProject);
    console.log(`Compilation ${compileResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (!compileResult.success) {
      console.log(`Errors (first 5):`);
      compileResult.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
    }
  } else {
    console.log('❌ No build tool detected');
  }

  // Test 2: NPM project (this workspace)
  const npmProject = '/home/amennillo/Workspace-Copilot';
  console.log(`\nTesting: ${npmProject}`);
  const npmAdapter = await detectBuildTool(npmProject);
  
  if (npmAdapter) {
    console.log('✅ Detected build tool: NPM');
  } else {
    console.log('❌ No build tool detected');
  }

  // Test 3: Unknown project
  const unknown = '/tmp';
  console.log(`\nTesting: ${unknown}`);
  const unknownAdapter = await detectBuildTool(unknown);
  
  if (unknownAdapter) {
    console.log('✅ Detected build tool');
  } else {
    console.log('✅ No build tool detected (expected)');
  }

  console.log('\n✅ Test completed!');
}

test().catch(console.error);
