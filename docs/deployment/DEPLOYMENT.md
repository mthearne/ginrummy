# Deployment Guide

## Vercel Deployment

### Prerequisites
1. Vercel account
2. Supabase account and project

### Environment Variables Setup

Add these environment variables in your Vercel dashboard:

#### Required Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Supabase PostgreSQL connection string | `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres` |
| `JWT_SECRET` | Secret for JWT tokens (generate with `openssl rand -base64 32`) | `abc123...` |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (generate with `openssl rand -base64 32`) | `def456...` |
| `CORS_ORIGIN` | Your Vercel app domain | `https://your-app.vercel.app` |
| `VITE_API_URL` | Your Vercel API endpoint | `https://your-app.vercel.app/api` |

#### Optional Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_EXPIRES_IN` | `15m` | JWT token expiration |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token expiration |
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3001` | Server port |
| `GAME_SNAPSHOT_ENABLED` | `true` | Set to `false` to disable snapshot capture entirely |
| `GAME_SNAPSHOT_INTERVAL` | `25` | Number of events between automatic state snapshots |
| `GAME_SNAPSHOT_FORCE_EVENTS` | `GAME_STARTED,ROUND_ENDED,GAME_FINISHED` | Comma-separated list of event types that always trigger snapshots |
| `GAME_SNAPSHOT_RETENTION` | `5` | Maximum snapshots per game to keep (older ones are pruned) |

### Database Setup

1. **Create a Supabase project**
   - Sign up at [supabase.com](https://supabase.com)
   - Create a new project
   - Copy your connection string from Settings > Database

2. **Run migrations:**
   ```bash
   npx prisma migrate deploy
   ```
3. **Seed with demo data (optional):**
   ```bash
   npx prisma db seed
   ```

### Deployment Steps

1. **Connect Repository**
   - Link your GitHub repository to Vercel
   - Vercel will auto-detect the configuration from `vercel.json`

2. **Set Environment Variables**
   - Go to your Vercel project settings
   - Add all required environment variables listed above

3. **Deploy**
   - Push to your main branch or trigger manual deployment
   - Vercel will build both the API and web app

### Post-Deployment

1. **Test the application**
   - Visit your Vercel URL
   - Create an account and test game functionality

2. **Monitor logs**
   - Check Vercel function logs for any errors
   - Monitor database connections

### Troubleshooting

- **Database connection issues**: Verify `DATABASE_URL` format
- **CORS errors**: Ensure `CORS_ORIGIN` matches your Vercel domain exactly
- **API not found**: Check that API routes start with `/api/`
- **Build failures**: Verify all dependencies are in `package.json`

### Security Notes

- Never commit real environment variables to Git
- Use strong, unique secrets for JWT tokens
- Keep database credentials secure
- Consider setting up monitoring and alerts
