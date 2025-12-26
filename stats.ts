import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_STATS = "dangerous-writing-stats";

export interface SessionRecord {
  timestamp: number;
  durationSeconds: number;
  wordsWritten: number;
  completed: boolean;
}

export class StatsView extends ItemView {
  private sessions: SessionRecord[];

  constructor(leaf: WorkspaceLeaf, sessions: SessionRecord[]) {
    super(leaf);
    this.sessions = sessions;
  }

  getViewType(): string {
    return VIEW_TYPE_STATS;
  }

  getDisplayText(): string {
    return "Zap Stats";
  }

  getIcon(): string {
    return "bar-chart-2";
  }

  updateSessions(sessions: SessionRecord[]) {
    this.sessions = sessions;
    this.render();
  }

  async onOpen() {
    this.render();
  }

  private render() {
    const container = this.containerEl.children[1];
    container.empty();

    container.createEl("h2", { text: "Zap Statistics" });

    // Time period filters
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const week = 7 * day;
    const month = 30 * day;

    const periods = [
      { name: "Today", start: now - day },
      { name: "Past Week", start: now - week },
      { name: "Past Month", start: now - month },
      { name: "All Time", start: 0 },
    ];

    for (const period of periods) {
      const periodSessions = this.sessions.filter(
        (s) => s.timestamp >= period.start
      );
      this.renderPeriodStats(container, period.name, periodSessions);
    }

    // Recent sessions list
    container.createEl("h3", { text: "Recent Sessions" });

    if (this.sessions.length === 0) {
      container.createEl("p", {
        text: "No sessions yet. Start a Zap session!",
        cls: "dangerous-writing-stats-empty",
      });
    } else {
      const recentSessions = this.sessions.slice(-10).reverse();
      const list = container.createEl("div", {
        cls: "dangerous-writing-sessions-list",
      });

      for (const session of recentSessions) {
        const item = list.createEl("div", {
          cls: "dangerous-writing-session-item",
        });
        const date = new Date(session.timestamp);
        const status = session.completed ? "✅" : "❌";
        const duration = this.formatDuration(session.durationSeconds);

        item.createEl("span", {
          text: `${status} ${date.toLocaleDateString()} ${date.toLocaleTimeString(
            [],
            { hour: "2-digit", minute: "2-digit" }
          )}`,
          cls: "session-date",
        });
        item.createEl("span", {
          text: `${session.wordsWritten} words`,
          cls: "session-words",
        });
        item.createEl("span", {
          text: duration,
          cls: "session-duration",
        });
      }
    }
  }

  private renderPeriodStats(
    container: Element,
    periodName: string,
    sessions: SessionRecord[]
  ) {
    const section = container.createEl("div", {
      cls: "dangerous-writing-stats-period",
    });
    section.createEl("h3", { text: periodName });

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.completed).length;
    const totalWords = sessions.reduce((sum, s) => sum + s.wordsWritten, 0);
    const totalTime = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);

    const statsGrid = section.createEl("div", {
      cls: "dangerous-writing-stats-grid",
    });

    this.createStatCard(statsGrid, "Sessions", totalSessions.toString());
    this.createStatCard(
      statsGrid,
      "Completed",
      `${completedSessions}/${totalSessions}`
    );
    this.createStatCard(
      statsGrid,
      "Words Written",
      totalWords.toLocaleString()
    );
    this.createStatCard(
      statsGrid,
      "Time Writing",
      this.formatDuration(totalTime)
    );

    if (totalSessions > 0) {
      const avgWords = Math.round(totalWords / totalSessions);
      const completionRate = Math.round(
        (completedSessions / totalSessions) * 100
      );
      this.createStatCard(statsGrid, "Avg Words/Session", avgWords.toString());
      this.createStatCard(statsGrid, "Completion Rate", `${completionRate}%`);
    }
  }

  private createStatCard(container: Element, label: string, value: string) {
    const card = container.createEl("div", {
      cls: "dangerous-writing-stat-card",
    });
    card.createEl("div", { text: value, cls: "stat-value" });
    card.createEl("div", { text: label, cls: "stat-label" });
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  async onClose() {
    // Nothing to clean up
  }
}
