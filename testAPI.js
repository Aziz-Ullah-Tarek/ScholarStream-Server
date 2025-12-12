// Test script for ScholarStream Backend API
// Run with: node testAPI.js

const BASE_URL = 'http://localhost:5000';

// Helper function to make requests
async function testEndpoint(name, url) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`📍 URL: ${url}`);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`✅ Status: ${response.status}`);
    console.log(`📦 Response:`, JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }
}

async function runTests() {
  console.log('🚀 Starting API Tests...\n');
  console.log('=' .repeat(60));

  // Test 1: Basic GET all scholarships
  await testEndpoint(
    'Get all scholarships (default)',
    `${BASE_URL}/api/scholarships`
  );

  // Test 2: Search by name
  await testEndpoint(
    'Search for "Engineering"',
    `${BASE_URL}/api/scholarships?search=Engineering`
  );

  // Test 3: Filter by country
  await testEndpoint(
    'Filter by USA',
    `${BASE_URL}/api/scholarships?country=USA`
  );

  // Test 4: Filter by category
  await testEndpoint(
    'Filter by Computer Science',
    `${BASE_URL}/api/scholarships?category=Computer Science`
  );

  // Test 5: Sort by application fees (ascending)
  await testEndpoint(
    'Sort by fees (cheapest first)',
    `${BASE_URL}/api/scholarships?sortBy=applicationFees&sortOrder=asc`
  );

  // Test 6: Sort by application fees (descending)
  await testEndpoint(
    'Sort by fees (most expensive first)',
    `${BASE_URL}/api/scholarships?sortBy=applicationFees&sortOrder=desc`
  );

  // Test 7: Sort by post date (newest first)
  await testEndpoint(
    'Sort by date (newest first)',
    `${BASE_URL}/api/scholarships?sortBy=postDate&sortOrder=desc`
  );

  // Test 8: Pagination - Page 1
  await testEndpoint(
    'Pagination - Page 1, Limit 5',
    `${BASE_URL}/api/scholarships?page=1&limit=5`
  );

  // Test 9: Pagination - Page 2
  await testEndpoint(
    'Pagination - Page 2, Limit 5',
    `${BASE_URL}/api/scholarships?page=2&limit=5`
  );

  // Test 10: Combined filters
  await testEndpoint(
    'Combined: Search + Country + Sort + Pagination',
    `${BASE_URL}/api/scholarships?search=Engineering&country=USA&sortBy=applicationFees&sortOrder=asc&page=1&limit=3`
  );

  // Test 11: Health check
  await testEndpoint(
    'Health check',
    `${BASE_URL}/health`
  );

  console.log('\n' + '=' .repeat(60));
  console.log('✅ All tests completed!');
}

// Run tests
runTests().catch(console.error);
