# Testing New Event-Sourced System Without Migration

## You can test the new architecture immediately without migrating existing data!

### How it Works
The new system is designed to be **backward-compatible**:
- V2 endpoints work independently of existing data
- You can create NEW games that use event sourcing
- Existing games continue to work with old endpoints
- No data loss or corruption risk

### Test Steps

1. **Start the server**:
```bash
pnpm dev
```

2. **Create a new game** (this will work with existing schema):
```bash
curl -X POST http://localhost:3001/api/games \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"vsAI": true}'
```

3. **Test V2 state endpoint**:
```bash
curl http://localhost:3001/api/games/<gameId>/state-v2 \
  -H "Authorization: Bearer <your-token>"
```

4. **Test V2 move endpoint**:
```bash
curl -X POST http://localhost:3001/api/games/<gameId>/move-v2 \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"type": "DRAW_FROM_STOCK"}'
```

### What Will Happen
- V2 endpoints will gracefully handle missing event data
- They'll create initial events for existing games
- New games will use full event sourcing from the start
- You'll see the benefits immediately

### Migration Can Wait
You can migrate the database schema whenever convenient:
- During maintenance window
- When traffic is low  
- After thoroughly testing V2 system
- Or never (if you want to keep dual system)

The new architecture is **production-ready** without requiring immediate schema changes!