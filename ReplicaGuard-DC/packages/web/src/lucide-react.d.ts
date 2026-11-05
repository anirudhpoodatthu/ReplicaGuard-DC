// Compatibility declaration for installations where lucide-react's bundled
// declaration entry is missing or not resolved by TypeScript. The icons are
// React components at runtime; this keeps the frontend build from being blocked
// by TS7016 while preserving the existing imports in App.tsx.
declare module 'lucide-react';
