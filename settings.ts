import DangerousWritingPlugin from './main';
import { App, PluginSettingTab, Setting } from 'obsidian';

export type PenaltyType = 'all' | 'paragraph' | 'sentence';

export interface DangerousWritingSettings {
	sessionDurationMinutes: number;
	defaultWordCountGoal: number;
	idleTimeoutSeconds: number;
	practiceMode: boolean;
	warningThresholdSeconds: number;
	showFirstTimeWarning: boolean;
	penaltyType: PenaltyType;
	warningColor: string;
}

export const DEFAULT_SETTINGS: DangerousWritingSettings = {
	sessionDurationMinutes: 5,
	defaultWordCountGoal: 0, // 0 means disabled, use duration instead
	idleTimeoutSeconds: 5,
	practiceMode: true,
	warningThresholdSeconds: 3,
	showFirstTimeWarning: true,
	penaltyType: 'all',
	warningColor: '#ff0000',
};

export class DangerousWritingSettingTab extends PluginSettingTab {
	plugin: DangerousWritingPlugin;

	constructor(app: App, plugin: DangerousWritingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private createStatCard(container: Element, label: string, value: string) {
		const card = container.createEl('div', { cls: 'dangerous-writing-stat-card' });
		card.createEl('div', { text: value, cls: 'stat-value' });
		card.createEl('div', { text: label, cls: 'stat-label' });
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

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Dangerous Writing Settings' });

		new Setting(containerEl)
			.setName('Default session duration (minutes)')
			.setDesc('Default duration for writing sessions (can be overridden when starting a session)')
			.addText(text => text
				.setPlaceholder('5')
				.setValue(this.plugin.settings.sessionDurationMinutes.toString())
				.onChange(async (value) => {
					const num = parseInt(value) || 5;
					if (num > 0 && num <= 1440) {
						this.plugin.settings.sessionDurationMinutes = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Default word count goal')
			.setDesc('Default word count goal (0 = disabled, use duration instead)')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(this.plugin.settings.defaultWordCountGoal.toString())
				.onChange(async (value) => {
					const num = parseInt(value) || 0;
					if (num >= 0 && num <= 100000) {
						this.plugin.settings.defaultWordCountGoal = num;
						await this.plugin.saveSettings();
					}
				}));

		const idleTimeoutSetting = new Setting(containerEl)
			.setName('Idle timeout (seconds)')
			.setDesc('How long you can stop typing before the penalty triggers')
			.addText(text => text
				.setPlaceholder('5')
				.setValue(this.plugin.settings.idleTimeoutSeconds.toString())
				.onChange(async (value) => {
					const num = parseInt(value) || 5;
					if (num > 0 && num <= 300) {
						this.plugin.settings.idleTimeoutSeconds = num;
						// Ensure warning threshold doesn't exceed idle timeout
						if (this.plugin.settings.warningThresholdSeconds > num) {
							this.plugin.settings.warningThresholdSeconds = num;
						}
						await this.plugin.saveSettings();
						this.display(); // Refresh to update warning threshold desc
					}
				}));

		new Setting(containerEl)
			.setName('Penalty type')
			.setDesc('What gets deleted when you stop typing')
			.addDropdown(dropdown => dropdown
				.addOption('all', 'Delete entire file')
				.addOption('paragraph', 'Delete last paragraph')
				.addOption('sentence', 'Delete last sentence')
				.setValue(this.plugin.settings.penaltyType)
				.onChange(async (value: PenaltyType) => {
					this.plugin.settings.penaltyType = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Practice mode')
			.setDesc('When enabled, you can recover content after a penalty. Disable for the real dangerous experience!')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.practiceMode)
				.onChange(async (value) => {
					this.plugin.settings.practiceMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Warning threshold (seconds)')
			.setDesc(`When to start showing visual warnings before idle timeout (max: ${this.plugin.settings.idleTimeoutSeconds}s)`)
			.addText(text => text
				.setPlaceholder('3')
				.setValue(this.plugin.settings.warningThresholdSeconds.toString())
				.onChange(async (value) => {
					const num = parseInt(value) || 3;
					const max = this.plugin.settings.idleTimeoutSeconds;
					if (num > 0 && num <= max) {
						this.plugin.settings.warningThresholdSeconds = num;
						await this.plugin.saveSettings();
					} else if (num > max) {
						// Auto-adjust to max if exceeds
						this.plugin.settings.warningThresholdSeconds = max;
						text.setValue(max.toString());
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Warning color')
			.setDesc('Color of the warning overlay when idle time approaches')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.warningColor)
				.onChange(async (value) => {
					this.plugin.settings.warningColor = value;
					await this.plugin.saveSettings();
					this.plugin.updateWarningStyles();
				}));

		containerEl.createEl('h2', { text: 'Statistics' });

		// Basic stats display
		const sessions = this.plugin.sessions || [];
		const now = Date.now();
		const day = 24 * 60 * 60 * 1000;
		const week = 7 * day;
		const month = 30 * day;

		const todaySessions = sessions.filter(s => s.timestamp >= now - day);
		const weekSessions = sessions.filter(s => s.timestamp >= now - week);
		const monthSessions = sessions.filter(s => s.timestamp >= now - month);

		const totalSessions = sessions.length;
		const completedSessions = sessions.filter(s => s.completed).length;
		const totalWords = sessions.reduce((sum, s) => sum + s.wordsWritten, 0);
		const totalTime = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);

		const statsContainer = containerEl.createDiv({ cls: 'dangerous-writing-basic-stats' });
		
		if (totalSessions > 0) {
			const statsGrid = statsContainer.createDiv({ cls: 'dangerous-writing-stats-grid' });
			
			this.createStatCard(statsGrid, 'Total Sessions', totalSessions.toString());
			this.createStatCard(statsGrid, 'Completed', `${completedSessions}/${totalSessions}`);
			this.createStatCard(statsGrid, 'Total Words', totalWords.toLocaleString());
			this.createStatCard(statsGrid, 'Total Time', this.formatDuration(totalTime));
			
			if (todaySessions.length > 0) {
				const todayWords = todaySessions.reduce((sum, s) => sum + s.wordsWritten, 0);
				this.createStatCard(statsGrid, 'Today', `${todaySessions.length} sessions, ${todayWords} words`);
			}
		} else {
			statsContainer.createEl('p', {
				text: 'No sessions yet. Start writing dangerously!',
				cls: 'dangerous-writing-stats-empty'
			});
		}

		new Setting(containerEl)
			.setName('View all statistics')
			.setDesc('See comprehensive writing history and detailed stats')
			.addButton(btn => btn
				.setButtonText('View All Stats')
				.onClick(() => {
					this.plugin.openStatsView();
				}));
	}
}
