# Deploying to Render from SourceHut

Yes! You can absolutely deploy your SourceHut repository to Render. Here's how:

## Step-by-Step Guide

### 1. Prepare Your SourceHut Repository

Make sure your repository has:
- `index.js` (your main server file)
- `package.json` (with dependencies)
- `public/` (your frontend files)
- `render.yaml` (configuration)

```bash
# If you haven't already, initialize your repo
hg init
# Add all files
hg add
hg commit -m "Ready for Render deployment"
# Push to SourceHut
hg push https://hg.sr.ht/~yourusername/werewolf-game
```

### 2. Create a Render Account

Go to [https://render.com](https://render.com) and sign up (free tier available)

### 3. Connect SourceHut to Render

1. **Create a new Web Service** in Render
2. **Connect Git Repository**
3. **Select SourceHut** as your Git provider
4. **Authorize Render** to access your SourceHut account
5. **Select your repository** (werewolf-game)

### 4. Configure Deployment

Render will automatically detect your `render.yaml` file with these settings:

```yaml
databases:
  - name: werewolf_db
    databaseName: werewolf
    user: werewolf

services:
  - type: web
    name: werewolf-game
    env: node
    buildCommand: npm install
    startCommand: node index.js
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
```

### 5. Deploy!

Click **Create Web Service** and Render will:
1. Pull your code from SourceHut
2. Run `npm install`
3. Start your server with `node index.js`
4. Give you a live URL (e.g., https://werewolf-game.onrender.com)

## Auto-Deployment

Render will automatically redeploy when you push changes to SourceHut:

```bash
# Make changes
hg commit -m "Updated game features"
hg push
# Render will automatically detect changes and redeploy
```

## Troubleshooting

### Build Errors
- Check **Build Logs** in Render dashboard
- Make sure all dependencies are in `package.json`
- Ensure `index.js` is in root directory

### Connection Issues
- Verify Socket.IO CORS settings
- Check firewall rules if using custom domain
- Test with `wss://` for secure WebSocket connections

### Database Issues
- Render provides PostgreSQL by default
- Update your connection string in `index.js` if needed
- Consider using environment variables for credentials

## Tips for Success

1. **Use environment variables** for sensitive data
2. **Enable auto-deploy** for continuous updates
3. **Monitor logs** in Render dashboard
4. **Set up custom domain** in Render settings
5. **Scale as needed** with Render's flexible plans

## Alternative: Manual Deployment

If you prefer not to connect Git:
1. **Create Web Service** in Render
2. **Upload ZIP** of your project
3. **Use same configuration** as above

## Why This Works Well

✅ **SourceHut** = Excellent version control
✅ **Render** = Easy Node.js hosting
✅ **Auto-deploy** = Continuous delivery
✅ **Free tier** = Cost-effective

This combination gives you the best of both worlds: SourceHut's powerful Git hosting with Render's simple Node.js deployment!

## Need More Help?

- [Render Documentation](https://render.com/docs)
- [SourceHut Guides](https://man.sr.ht)
- [Node.js on Render](https://render.com/docs/node)
