import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import {
  DangerousWritingSettingTab,
  DangerousWritingSettings,
  DEFAULT_SETTINGS,
  PenaltyType,
} from "./settings";
import {
  SessionConfigModal,
  FirstTimeWarningModal,
  SessionConfig,
} from "./modal";
import { StatsView, VIEW_TYPE_STATS, SessionRecord } from "./stats";

interface PluginData {
  settings: DangerousWritingSettings;
  sessions: SessionRecord[];
}

export default class DangerousWritingPlugin extends Plugin {
  settings: DangerousWritingSettings;
  sessions: SessionRecord[] = [];

  // Session state
  private sessionActive: boolean = false;
  private sessionStartTime: number = 0;
  private sessionDurationMs: number = 0;
  private wordCountGoal: number | null = null;
  private initialWordCount: number = 0;
  private activeFile: TFile | null = null;
  private initialContent: string = "";
  private sessionInterval: number | null = null;

  // Idle watchdog
  private idleWatchdogTimeout: number | null = null;
  private lastActivityTime: number = 0;
  private warningOverlay: HTMLElement | null = null;

  // Status bar
  private statusBarEl: HTMLElement | null = null;
  private statusBarInterval: number | null = null;

  // Dynamic styles
  private styleEl: HTMLStyleElement | null = null;

  async onload() {
    await this.loadSettings();

    // Add dynamic warning styles
    this.updateWarningStyles();

    // Register stats view
    this.registerView(
      VIEW_TYPE_STATS,
      (leaf) => new StatsView(leaf, this.sessions)
    );

    // Show first-time warning if needed
    if (this.settings.showFirstTimeWarning) {
      new FirstTimeWarningModal(this.app, () => {
        this.settings.showFirstTimeWarning = false;
        this.saveSettings();
      }).open();
    }

    // Add ribbon icon
    this.addRibbonIcon("zap", "Start Zap Session", (evt: MouseEvent) => {
      this.startSession();
    });

    // Add command
    this.addCommand({
      id: "start-dangerous-writing",
      name: "Start Zap writing session",
      callback: () => {
        this.startSession();
      },
    });

    // Add command to stop session
    this.addCommand({
      id: "stop-dangerous-writing",
      name: "Stop Zap writing session",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return this.sessionActive;
        }
        if (this.sessionActive) {
          this.stopSession(true);
        }
        return true;
      },
    });

    // Add command to open stats
    this.addCommand({
      id: "open-dangerous-writing-stats",
      name: "Open writing statistics",
      callback: () => {
        this.openStatsView();
      },
    });

    // Register editor change event
    this.registerEvent(
      this.app.workspace.on(
        "editor-change",
        (editor: Editor, info: MarkdownView | { file: TFile }) => {
          if (this.sessionActive) {
            this.resetIdleWatchdog();
          }
        }
      )
    );

    // Register active leaf change event (note switching)
    this.registerEvent(
      this.app.workspace.on(
        "active-leaf-change",
        (leaf: WorkspaceLeaf | null) => {
          if (this.sessionActive && leaf) {
            const view = leaf.view;
            if (view instanceof MarkdownView) {
              const currentFile = view.file;
              if (
                this.activeFile &&
                currentFile &&
                currentFile.path !== this.activeFile.path
              ) {
                new Notice("Switched files during session - session ended");
                this.stopSession(false);
              }
            }
          }
        }
      )
    );

    // Add settings tab
    this.addSettingTab(new DangerousWritingSettingTab(this.app, this));

    // Initialize status bar
    this.statusBarEl = this.addStatusBarItem();
    this.updateStatusBar();
  }

  onunload() {
    if (this.sessionActive) {
      this.stopSession(false);
    }
    this.cleanup();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_STATS);
  }

  async loadSettings() {
    const data = (await this.loadData()) as PluginData | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
    this.sessions = data?.sessions || [];
  }

  async saveSettings() {
    const data: PluginData = {
      settings: this.settings,
      sessions: this.sessions,
    };
    await this.saveData(data);
  }

  async openStatsView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_STATS);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    await this.app.workspace.getRightLeaf(false)?.setViewState({
      type: VIEW_TYPE_STATS,
      active: true,
    });
  }

  updateWarningStyles() {
    // Remove existing style element
    if (this.styleEl) {
      this.styleEl.remove();
    }

    const color = this.settings.warningColor;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    this.styleEl = document.createElement("style");
    this.styleEl.textContent = `
			.dangerous-writing-warning-overlay {
				transition: background-color 0.1s ease-out;
			}
		`;
    document.head.appendChild(this.styleEl);
  }

  private recordSession(
    wordsWritten: number,
    durationSeconds: number,
    completed: boolean
  ) {
    const record: SessionRecord = {
      timestamp: Date.now(),
      durationSeconds,
      wordsWritten,
      completed,
    };
    this.sessions.push(record);
    this.saveSettings();

    // Update stats view if open
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_STATS);
    for (const leaf of leaves) {
      if (leaf.view instanceof StatsView) {
        leaf.view.updateSessions(this.sessions);
      }
    }
  }

  private showClickableNotice(message: string, duration: number = 0) {
    const notice = new Notice(message, duration);
    // Make notice clickable to close
    const noticeEl = (notice as any).noticeEl as HTMLElement;
    if (noticeEl) {
      noticeEl.style.cursor = "pointer";
      noticeEl.addEventListener("click", () => {
        notice.hide();
      });
    }
    return notice;
  }

  private startSession() {
    if (this.sessionActive) {
      new Notice("Session already active!");
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Please open a markdown file to start a session");
      return;
    }

    const file = view.file;
    if (!file) {
      new Notice("No file is open");
      return;
    }

    // Check if file has content
    const editor = view.editor;
    const currentContent = editor.getValue();
    const hasExistingContent = currentContent.trim().length > 0;

    // Open configuration modal (warning will be shown inside modal if needed)
    new SessionConfigModal(
      this.app,
      this.settings.sessionDurationMinutes,
      this.settings.defaultWordCountGoal,
      hasExistingContent,
      this.settings.practiceMode,
      this.settings.penaltyType,
      (config: SessionConfig) => {
        this.beginSession(file, editor, config);
      }
    ).open();
  }

  private beginSession(file: TFile, editor: Editor, config: SessionConfig) {
    this.sessionActive = true;
    this.activeFile = file;
    this.initialContent = editor.getValue();
    this.initialWordCount = this.countWords(this.initialContent);
    this.sessionStartTime = Date.now();

    if (config.wordCountGoal !== null) {
      this.wordCountGoal = config.wordCountGoal;
      this.sessionDurationMs = 0; // No time limit, only word count
    } else {
      this.wordCountGoal = null;
      this.sessionDurationMs = (config.durationMinutes || 5) * 60 * 1000;
    }

    // Start session timer/checker
    const intervalId = window.setInterval(() => {
      if (this.wordCountGoal !== null) {
        // Check word count goal
        const currentWords = this.countWords(editor.getValue());
        if (currentWords - this.initialWordCount >= this.wordCountGoal) {
          this.completeSession();
        } else {
          this.updateStatusBar();
        }
      } else {
        // Check duration
        const elapsed = Date.now() - this.sessionStartTime;
        if (elapsed >= this.sessionDurationMs) {
          this.completeSession();
        } else {
          this.updateStatusBar();
        }
      }
    }, 1000);
    this.sessionInterval = intervalId;
    this.registerInterval(intervalId);

    // Start idle watchdog
    this.resetIdleWatchdog();

    // Update status bar
    this.updateStatusBar();

    // Create warning overlay
    this.createWarningOverlay();

    if (this.wordCountGoal !== null) {
      new Notice(
        `Zap session started! Goal: ${this.wordCountGoal} words. Keep typing!`
      );
    } else {
      const minutes = Math.floor(this.sessionDurationMs / 60000);
      new Notice(`Zap session started! ${minutes} minutes. Keep typing!`);
    }
  }

  private resetIdleWatchdog() {
    // Clear existing timeout
    if (this.idleWatchdogTimeout !== null) {
      window.clearTimeout(this.idleWatchdogTimeout);
      this.idleWatchdogTimeout = null;
    }

    this.lastActivityTime = Date.now();

    // Clear warning overlay
    if (this.warningOverlay) {
      this.warningOverlay.className = "dangerous-writing-warning-overlay";
      this.warningOverlay.style.backgroundColor = "";
    }

    // Set new timeout
    this.idleWatchdogTimeout = window.setTimeout(() => {
      this.triggerPenalty();
    }, this.settings.idleTimeoutSeconds * 1000);

    // Start warning interval
    this.startWarningInterval();
  }

  private startWarningInterval() {
    // Check every 50ms for smooth progression
    const checkInterval = 50;
    const warningThreshold = this.settings.warningThresholdSeconds * 1000;
    const color = this.settings.warningColor;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    const warningCheck = window.setInterval(() => {
      if (!this.sessionActive) {
        window.clearInterval(warningCheck);
        return;
      }

      const idleTime = Date.now() - this.lastActivityTime;
      const remaining = this.settings.idleTimeoutSeconds * 1000 - idleTime;

      if (remaining <= 0) {
        window.clearInterval(warningCheck);
        if (this.warningOverlay) {
          this.warningOverlay.style.backgroundColor = "";
        }
        return;
      }

      if (remaining <= warningThreshold && this.warningOverlay) {
        // Smooth progression from 0 to 1 as remaining time approaches 0
        const progress = 1 - remaining / warningThreshold;
        // Use easing function for smoother transition (ease-out cubic)
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        // Opacity ranges from 0.05 to 0.6 for smoother visual
        const opacity = 0.05 + easedProgress * 0.55;
        this.warningOverlay.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      } else if (remaining > warningThreshold && this.warningOverlay) {
        this.warningOverlay.style.backgroundColor = "";
      }
    }, checkInterval);
  }

  private applyPenalty(editor: Editor, content: string): string {
    const penaltyType = this.settings.penaltyType;

    if (penaltyType === "all") {
      return "";
    }

    if (penaltyType === "sentence") {
      // Remove last sentence (ends with . ! ? or newline followed by content)
      const sentenceEndings = /[.!?]\s*$/;
      let result = content.trimEnd();

      // Find the last sentence ending
      const lastSentenceMatch = result.match(/[.!?][^.!?]*$/);
      if (lastSentenceMatch) {
        result = result.slice(0, result.length - lastSentenceMatch[0].length);
      } else {
        // No sentence ending found, remove last line
        const lines = result.split("\n");
        if (lines.length > 1) {
          lines.pop();
          result = lines.join("\n");
        } else {
          result = "";
        }
      }
      return result;
    }

    if (penaltyType === "paragraph") {
      // Remove last paragraph (separated by double newline)
      const paragraphs = content.split(/\n\n+/);
      if (paragraphs.length > 1) {
        paragraphs.pop();
        return paragraphs.join("\n\n");
      }
      // Only one paragraph, remove it all
      return "";
    }

    return "";
  }

  private triggerPenalty() {
    if (!this.sessionActive) {
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file !== this.activeFile) {
      return;
    }

    const editor = view.editor;
    const currentContent = editor.getValue();
    const wordsWritten = this.countWords(currentContent);
    const durationSeconds = Math.floor(
      (Date.now() - this.sessionStartTime) / 1000
    );

    // Save initial content before stopping session (which clears it)
    const savedInitialContent = this.initialContent;
    const practiceMode = this.settings.practiceMode;

    // Apply the penalty based on settings
    const newContent = this.applyPenalty(editor, currentContent);
    editor.setValue(newContent);

    // Show penalty notice with details
    const penaltyTypeText =
      this.settings.penaltyType === "all"
        ? "All content"
        : this.settings.penaltyType === "paragraph"
        ? "Last paragraph"
        : "Last sentence";
    this.showClickableNotice(
      `⛔ You stopped writing! ${penaltyTypeText} deleted!`,
      0
    );

    // Record session
    this.recordSession(wordsWritten, durationSeconds, false);

    // Stop session
    this.stopSession(false);

    // Show recovery option if in practice mode
    if (practiceMode) {
      const recover = confirm(
        "Practice mode: Would you like to restore the original content?"
      );
      if (recover) {
        editor.setValue(savedInitialContent);
        new Notice("Content restored");
      }
    }
  }

  private completeSession() {
    if (!this.sessionActive) {
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file !== this.activeFile) {
      this.stopSession(false);
      return;
    }

    const editor = view.editor;
    const wordsWritten = this.countWords(editor.getValue());
    const durationSeconds = Math.floor(
      (Date.now() - this.sessionStartTime) / 1000
    );

    // Record session
    this.recordSession(wordsWritten, durationSeconds, true);

    this.stopSession(true);

    // Show clickable notice with stats
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    this.showClickableNotice(
      `🎉 Session completed! ${wordsWritten} words in ${durationStr}. (click to close)`,
      0
    );
  }

  private stopSession(completed: boolean) {
    if (!this.sessionActive) {
      return;
    }

    this.sessionActive = false;

    // Clear intervals and timeouts
    if (this.sessionInterval !== null) {
      window.clearInterval(this.sessionInterval);
      this.sessionInterval = null;
    }

    if (this.idleWatchdogTimeout !== null) {
      window.clearTimeout(this.idleWatchdogTimeout);
      this.idleWatchdogTimeout = null;
    }

    if (this.statusBarInterval !== null) {
      window.clearInterval(this.statusBarInterval);
      this.statusBarInterval = null;
    }

    // Remove warning overlay
    this.removeWarningOverlay();

    // Reset state
    this.activeFile = null;
    this.initialContent = "";
    this.initialWordCount = 0;
    this.wordCountGoal = null;
    this.lastActivityTime = 0;

    // Update status bar
    this.updateStatusBar();
  }

  private createWarningOverlay() {
    if (this.warningOverlay) {
      return;
    }

    this.warningOverlay = document.createElement("div");
    this.warningOverlay.className = "dangerous-writing-warning-overlay";
    document.body.appendChild(this.warningOverlay);
  }

  private removeWarningOverlay() {
    if (this.warningOverlay) {
      this.warningOverlay.remove();
      this.warningOverlay = null;
    }
  }

  private updateStatusBar() {
    if (!this.statusBarEl) {
      return;
    }

    if (!this.sessionActive) {
      this.statusBarEl.setText("");
      this.statusBarEl.className = "";
      return;
    }

    // Calculate idle time
    const idleTime = Date.now() - this.lastActivityTime;
    const idleSeconds = Math.floor(idleTime / 1000);
    const idleRemaining = Math.max(
      0,
      this.settings.idleTimeoutSeconds - idleSeconds
    );

    let statusText = "";

    if (this.wordCountGoal !== null) {
      // Word count mode
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.file === this.activeFile) {
        const currentWords = this.countWords(view.editor.getValue());
        const wordsWritten = currentWords - this.initialWordCount;
        const remaining = Math.max(0, this.wordCountGoal - wordsWritten);
        statusText = `📝 ${wordsWritten}/${this.wordCountGoal} words`;
      } else {
        statusText = `📝 Goal: ${this.wordCountGoal} words`;
      }
    } else {
      // Duration mode
      const elapsed = Date.now() - this.sessionStartTime;
      const remaining = Math.max(0, this.sessionDurationMs - elapsed);
      const remainingMinutes = Math.floor(remaining / 60000);
      const remainingSeconds = Math.floor((remaining % 60000) / 1000);
      statusText = `⏱️ ${remainingMinutes}:${String(remainingSeconds).padStart(
        2,
        "0"
      )}`;
    }

    if (idleRemaining <= this.settings.warningThresholdSeconds) {
      statusText += ` | ⚠️ ${idleRemaining}s idle`;
      this.statusBarEl.className =
        "dangerous-writing-status-bar active warning";
    } else {
      statusText += ` | ${idleRemaining}s idle`;
      this.statusBarEl.className = "dangerous-writing-status-bar active";
    }

    this.statusBarEl.setText(statusText);
  }

  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  private cleanup() {
    this.removeWarningOverlay();
    if (this.statusBarEl) {
      this.statusBarEl.remove();
      this.statusBarEl = null;
    }
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }
}
