# Step-by-Step Migration Guide

## Option 2: Incremental Prisma Approach

### Step 1: Add basic columns
```bash
# Temporarily simplify schema - just add essential columns
npx prisma db push --accept-data-loss
```

### Step 2: Create new tables separately
```bash
# Add game_snapshots table
npx prisma migrate dev --name "add-snapshots-table"
```

### Step 3: Update existing table constraints
```bash
# Add foreign keys and indexes
npx prisma migrate dev --name "add-constraints"
```

## Option 3: Fresh Database (Development Only)
If you're in development and can lose existing data:

```bash
# Reset the entire database
npx prisma migrate reset --force

# Apply all migrations fresh
npx prisma migrate dev
```

## Option 4: Use Raw SQL in Node.js
Create a migration script:

```javascript
// migrate.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  await prisma.$executeRaw`
    -- Your SQL here
    ALTER TABLE games ADD COLUMN IF NOT EXISTS current_player_id TEXT;
  `;
}

migrate();
```

## Option 5: Use Supabase SQL Editor
1. Go to Supabase Dashboard > SQL Editor
2. Run the SQL commands directly
3. Update Prisma schema to match
4. Run `npx prisma db pull` to sync schema

## Recommended: Option 1 (Manual SQL)
For fastest results, use the Supabase SQL Editor with the provided SQL above.