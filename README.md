# Werewolf Game - Deployment Guide

## SourceHut Deployment

SourceHut is a great option for hosting your Werewolf game! Here's how to deploy:

### Option 1: SourceHut Pages (Static Frontend Only)

1. **Create a SourceHut account**: [https://sourcehut.org](https://sourcehut.org)

2. **Create a new repository**:
```bash
hg init werewolf-game
cd werewolf-game
# Copy your public/ files here
hg add
hg commit -m "Initial commit"
hg push https://hg.sr.ht/~yourusername/werewolf-game
```

3. **Enable SourceHut Pages**:
- Go to your repository settings
- Enable "Pages" service
- Set build command to: `echo "No build needed"`
- Set publish directory to: `public`

### Option 2: Full Stack with External Hosting

Since SourceHut Pages only supports static sites, you'll need to host the Node.js backend separately:

1. **Host frontend on SourceHut Pages** (as above)
2. **Host backend on another service** (Render, Fly.io, Railway, etc.)
3. **Update frontend to connect to your backend**:
   ```javascript
   // In all your frontend files, change:
   const socket = io();
   // To:
   const socket = io('https://your-backend-url.com');
   ```

### Option 3: Self-Hosting with SourceHut Builds

If you want to self-host the full stack:

1. **Set up a VPS** (DigitalOcean, Linode, etc.)
2. **Clone your repository**:
   ```bash
   hg clone https://hg.sr.ht/~yourusername/werewolf-game
   cd werewolf-game
   ```

3. **Install dependencies and run**:
   ```bash
   npm install
   node index.js
   ```

4. **Set up reverse proxy** (Nginx example):
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## Alternative Hosting Options

If SourceHut doesn't meet your needs, consider:

### Free Tier Options:
- **Render**: Free tier available
- **Railway**: Free tier available  
- **Fly.io**: Free tier available
- **Cyclic**: Free Node.js hosting

### Paid Options:
- **DigitalOcean**: $5/month droplets
- **Linode**: $5/month plans
- **AWS Lightsail**: $3.50/month

## Recommendation

For the simplest deployment:
1. **Host frontend on SourceHut Pages** (free)
2. **Host backend on Render/Railway** (free tier)
3. **Connect them with Socket.IO**

This gives you the best of both worlds: SourceHut's excellent version control and a free backend host!

## Need Help?

- SourceHut documentation: [https://man.sr.ht](https://man.sr.ht)
- Join the SourceHut community: [https://lists.sr.ht](https://lists.sr.ht)
- IRC: #sourcehut on irc.libera.chat
