const axios = require('axios');
const fs = require("fs");
const Conf = require('conf');
const path = require('path');

// Initialize data cache for icons directory path
const data = new Conf({
  configName: 'jira-data',
  schema: {
    updated: { type: 'number' },
    items: { type: 'array', default: [] },
  },
  serialize: (value) => JSON.stringify(value),
});

// Create icons directory in cache folder
const iconsDir = path.join(path.dirname(data.path), 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function truncate(str, num) {
  if (str.length <= num) { return str }
  return str.slice(0, num) + '...'
}

/**
 * Format a date to human-readable time ago
 * 
 * @param  {String} dateString ISO date string
 * @return {String} Human-readable time ago (e.g., "2 hours ago", "3 days ago")
 */
function timeAgo(dateString) {
  const now = Date.now();
  const updated = new Date(dateString).getTime();
  const diffMs = now - updated;
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}


module.exports = (issues) =>
  issues.map(({ id, key, fields }) => {
    // Build subtitle with status, assignee, and time since update
    const subtitle = [
      fields.status.name.trim(),
      fields.assignee ? fields.assignee.displayName : 'unassigned',
      fields.updated ? timeAgo(fields.updated) : ''
    ].filter(Boolean).join(' → ');
    
    return {
    uid: id,
    title: `${key} – ${fields.summary}`,
    subtitle: subtitle,
    arg: `https://${process.env.JIRA_DOMAIN}.atlassian.net/browse/${key}`,
    quicklookurl: `https://${process.env.JIRA_DOMAIN}.atlassian.net/browse/${key}`,
    // icon: { type: 'png', path: `static/10500.png` },
    text: {
      copy: key,
    },
    valid: true,
    autocomplete: key,
    mods: {
      cmd: {
        subtitle: 'Copy the issue key whit ⌘+C',
      },
    },
    get icon() {
      // Use fallback if no icon URL
      if (!fields.issuetype.iconUrl) {
        console.error(`[Icon] No iconUrl for ${key}`);
        return { type: 'png', path: "./static/task.png" };
      }
      
      const iconUrl = fields.issuetype.iconUrl;
      const iconId = fields.issuetype.avatarId || iconUrl.split('/').pop().split('?')[0] || 'default';
      
      // Always prefer SVG if available in cache
      const svgPath = path.join(iconsDir, `${iconId}.svg`);
      if (fs.existsSync(svgPath)) {
        console.error(`[Icon] Using cached SVG icon for ${key}: ${svgPath}`);
        return { type: 'svg', path: svgPath };
      }
      
      // Check for other formats in cache
      const pngPath = path.join(iconsDir, `${iconId}.png`);
      if (fs.existsSync(pngPath)) {
        console.error(`[Icon] Using cached PNG icon for ${key}: ${pngPath}`);
        return { type: 'png', path: pngPath };
      }
      
      const gifPath = path.join(iconsDir, `${iconId}.gif`);
      if (fs.existsSync(gifPath)) {
        console.error(`[Icon] Using cached GIF icon for ${key}: ${gifPath}`);
        return { type: 'png', path: gifPath };
      }
      
      // Nothing in cache - always try SVG first (preferred format)
      console.error(`[Icon] Downloading icon for ${key}: ${iconId} (trying SVG first)`);
      
      axios.get(iconUrl, {
        auth: {
          username: process.env.JIRA_USERNAME,
          password: process.env.JIRA_TOKEN,
        },
        timeout: 5000,
        responseType: 'text', // Get as text to check if it's SVG
        headers: {
          'Accept': 'image/svg+xml,image/*',
        },
      }).then(res => {
        try {
          const contentType = res.headers['content-type'] || '';
          const data = res.data.toString();
          
          // Check if response is SVG
          if (contentType.includes('svg') || data.trim().startsWith('<svg') || data.includes('<?xml')) {
            console.error(`[Icon] Got SVG for ${key}`);
            // Resize SVG from 16px to 32px for better visibility
            const iconData = data.trim()
              .replaceAll('16px', '32px')
              .replaceAll('width="16"', 'width="32"')
              .replaceAll('height="16"', 'height="32"');
            fs.writeFileSync(svgPath, iconData, 'utf-8');
          } else {
            // Not SVG, save as PNG
            console.error(`[Icon] Got PNG/other format for ${key} (content-type: ${contentType})`);
            // Re-download as binary for PNG
            axios.get(iconUrl, {
              auth: {
                username: process.env.JIRA_USERNAME,
                password: process.env.JIRA_TOKEN,
              },
              timeout: 5000,
              responseType: 'arraybuffer',
            }).then(binaryRes => {
              fs.writeFileSync(pngPath, Buffer.from(binaryRes.data));
              console.error(`[Icon] Successfully saved PNG icon for ${key}`);
            }).catch(err => {
              console.error(`[Icon] Failed to re-download as binary for ${key}:`, err.message);
            });
          }
        } catch (writeErr) {
          console.error(`[Icon] Failed to process icon for ${key}:`, writeErr.message);
        }
      }).catch(err => {
        console.error(`[Icon] Failed to download icon for ${key}:`, err.message);
        if (err.response) {
          console.error(`[Icon] Response status: ${err.response.status}`);
        }
      });
      
      // Show fallback while downloading
      return { type: 'png', path: "./static/task.png" };
    },
    get match() {
      let projecSplit = key.split('-');
      const project = projecSplit.shift();
      const number = projecSplit.shift();
      const assignee = fields.assignee ? fields.assignee.displayName : 'unassigned';

      return `${project} ${number} ${key} ${fields.summary} ${assignee} ${fields.status.name} `;
    },
  }});
