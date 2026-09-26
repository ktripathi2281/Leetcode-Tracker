export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const STATUSES = ['Todo', 'Attempted', 'Solved', 'Reviewing', 'Mastered'] as const;
export type Status = (typeof STATUSES)[number];

export const LANGUAGES = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  kotlin: 'Kotlin',
  swift: 'Swift',
  ruby: 'Ruby',
  scala: 'Scala',
  php: 'PHP',
  sql: 'SQL',
  other: 'Other',
} as const;
export type Language = keyof typeof LANGUAGES;
export const LANGUAGE_IDS = Object.keys(LANGUAGES) as [Language, ...Language[]];

// LeetCode's own topic names, so manual tags match auto-filled ones.
export const COMMON_TAGS = [
  'Array', 'String', 'Hash Table', 'Dynamic Programming', 'Math', 'Sorting', 'Greedy',
  'Depth-First Search', 'Breadth-First Search', 'Binary Search', 'Tree', 'Binary Tree',
  'Matrix', 'Two Pointers', 'Sliding Window', 'Prefix Sum', 'Stack', 'Monotonic Stack',
  'Queue', 'Heap (Priority Queue)', 'Graph', 'Topological Sort', 'Union Find', 'Linked List',
  'Backtracking', 'Recursion', 'Memoization', 'Trie', 'Bit Manipulation', 'Divide and Conquer',
  'Binary Search Tree', 'Segment Tree', 'Ordered Set', 'Design', 'Simulation', 'Counting',
  'Bitmask', 'Geometry', 'Database',
];

export const COMMON_COMPANIES = [
  'Google', 'Meta', 'Amazon', 'Apple', 'Microsoft', 'Netflix', 'Uber', 'Airbnb', 'Bloomberg',
  'Adobe', 'Oracle', 'LinkedIn', 'Salesforce', 'Goldman Sachs', 'Stripe', 'Databricks',
  'Atlassian', 'Flipkart', 'TikTok', 'Nvidia',
];
