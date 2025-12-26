# Zap: A Dangerous Writing Plugin for Obsidian

A "Most Dangerous Writing App" experience for Obsidian. Run timed or word-goal writing sprints and keep typing—if you stop for more than 5 seconds, your content gets deleted!

## Features

- **Timed Writing Sessions**: Set a duration (1-60 minutes) for your writing session
- **Word Count Goals**: Run sprints to a target word count instead of a timer
- **Idle Detection**: Stop typing for 5 seconds (configurable) and face the penalty
- **Penalty Options**: Choose to delete entire file, last paragraph, or just last sentence
- **Visual Warnings**: Progressive colored overlay warns you as idle time approaches
- **Custom Warning Color**: Pick your own warning color in settings
- **Status Bar**: Shows remaining session time and idle countdown
- **Practice Mode**: Enabled by default - recover content after a penalty
- **Statistics Dashboard**: Track your writing history with stats for today, past week, month, and all time

## Installation

### For Development/Testing

1. Navigate to your vault's plugins folder:

   ```bash
   cd ~/Documents/Writing/.obsidian/plugins
   mkdir dangerous-writing
   cd dangerous-writing
   ```

2. Copy the plugin files or clone from the source:

   ```bash
   # Copy all files from the obsidian/ folder to this directory
   ```

3. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

4. In Obsidian:
   - Open Settings → Community plugins
   - Turn off "Restricted mode" if prompted
   - Click "Reload plugins"
   - Enable "Zap"

### Quick Build Commands

```bash
# Install dependencies
npm install

# Build for production (one-time)
npm run build

# Development mode (auto-rebuild on changes)
npm run dev
```

## Usage

1. Open a markdown file in Obsidian
2. Click the zap icon (⚡) in the ribbon, or use command palette: "Start Zap writing session"
3. Configure a time or word goal and click "Start Zap Session"
4. Keep typing! If you stop for more than 5 seconds, content is deleted
5. Complete the session to keep your content

## Settings

| Setting           | Description                                                      | Default       |
| ----------------- | ---------------------------------------------------------------- | ------------- |
| Session duration  | How long each writing session lasts                              | 5 minutes     |
| Word count goal   | Default words to target when using word mode                     | 500 words     |
| Idle timeout      | How long you can stop before penalty                             | 5 seconds     |
| Penalty type      | What gets deleted: entire file, last paragraph, or last sentence | Entire file   |
| Practice mode     | Enable to recover content after a penalty                        | On            |
| Warning threshold | When to start showing visual warnings                            | 3 seconds     |
| Warning color     | Color of the warning overlay                                     | Red (#ff0000) |

## Statistics

Open the statistics view via:

- Command palette: "Open writing statistics"
- Settings → Statistics → Open Stats button

View your writing history including:

- Total sessions, completed sessions, words written, time spent
- Stats for Today, Past Week, Past Month, and All Time
- Recent session history with completion status

## Commands

- `Start Zap writing session` - Begin a new session
- `Stop Zap writing session` - End the current session early
- `Open writing statistics` - View your Zap writing stats

## Safety Notes

⚠️ **Practice mode is ON by default** - you can always recover content after a penalty.

- Always test in a safe vault first
- The plugin tracks the active file - switching files ends the session
- Make backups before disabling practice mode
- Click any completion/penalty notice to dismiss it

# dangerous-writing-plugin
