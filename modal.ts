import { App, Modal, Notice } from "obsidian";

export interface SessionConfig {
  durationMinutes: number | null;
  wordCountGoal: number | null;
}

export class SessionConfigModal extends Modal {
  result: SessionConfig | null = null;
  onSubmit: (result: SessionConfig) => void;
  durationMinutes: number;
  wordCountGoal: number;
  useWordCount: boolean;
  practiceMode: boolean;
  penaltyType: "all" | "paragraph" | "sentence";

  constructor(
    app: App,
    defaultDuration: number,
    defaultWordCount: number,
    hasExistingContent: boolean,
    practiceMode: boolean,
    penaltyType: "all" | "paragraph" | "sentence",
    onSubmit: (result: SessionConfig) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.durationMinutes = defaultDuration;
    this.wordCountGoal = defaultWordCount;
    this.useWordCount = defaultWordCount > 0;
    this.practiceMode = practiceMode;
    this.penaltyType = penaltyType;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dw-modal");

    this.setTitle("Start Zap Session");

    // Brief warning line
    const penaltyText =
      this.penaltyType === "all"
        ? "everything"
        : this.penaltyType === "paragraph"
        ? "the last paragraph"
        : "the last sentence";

    if (this.practiceMode) {
      contentEl.createEl("p", {
        text: `Practice mode is ON — stopping will delete ${penaltyText}, but you can recover it.`,
        cls: "dangerous-writing-warning-text",
      });
    } else {
      contentEl.createEl("p", {
        text: `Not in practice mode — if you stop typing, you lose ${penaltyText}!`,
        cls: "dangerous-writing-warning-text",
      });
    }

    // Segmented toggle (Minutes / Words)
    const seg = contentEl.createDiv({ cls: "dw-seg" });
    const minutesBtn = seg.createEl("button", {
      text: "Minutes",
      cls: "dw-seg-btn",
    });
    const wordsBtn = seg.createEl("button", {
      text: "Words",
      cls: "dw-seg-btn",
    });

    // Picker area
    const picker = contentEl.createDiv({ cls: "dw-picker" });

    const setActiveChip = (wrap: HTMLElement, value: number) => {
      wrap.querySelectorAll("button.dw-chip").forEach((b) => {
        const btn = b as HTMLButtonElement;
        btn.classList.toggle("is-active", btn.dataset.value === String(value));
      });
    };

    type Mode = "minutes" | "words";

    const CONFIG: Record<
      Mode,
      {
        presets: number[];
        unit: string;
        get: () => number;
        set: (n: number) => void;
      }
    > = {
      minutes: {
        presets: [5, 10, 15, 20, 30],
        unit: "min",
        get: () => this.durationMinutes || 5,
        set: (n) => (this.durationMinutes = n),
      },
      words: {
        presets: [100, 250, 500, 750, 1000],
        unit: "words",
        get: () => (this.wordCountGoal > 0 ? this.wordCountGoal : 500),
        set: (n) => (this.wordCountGoal = n),
      },
    };

    let inputEl: HTMLInputElement | null = null;
    let chipsWrap: HTMLElement | null = null;

    const renderPicker = (mode: Mode) => {
      minutesBtn.classList.toggle("is-active", mode === "minutes");
      wordsBtn.classList.toggle("is-active", mode === "words");

      picker.empty();

      chipsWrap = picker.createDiv({ cls: "dw-chips" });
      for (const preset of CONFIG[mode].presets) {
        const btn = chipsWrap.createEl("button", {
          text: String(preset),
          cls: "dw-chip",
        });
        btn.dataset.value = String(preset);
        btn.onclick = () => {
          CONFIG[mode].set(preset);
          if (inputEl) inputEl.value = String(preset);
          if (chipsWrap) setActiveChip(chipsWrap, preset);
        };
      }

      const row = picker.createDiv({ cls: "dw-input-row" });
      inputEl = row.createEl("input", {
        type: "text",
        cls: "dw-input",
        value: String(CONFIG[mode].get()),
      });
      inputEl.setAttribute("inputmode", "numeric");
      inputEl.addEventListener("input", () => {
        const num = parseInt(inputEl!.value);
        if (!isNaN(num) && num > 0) {
          CONFIG[mode].set(num);
          if (chipsWrap) setActiveChip(chipsWrap, num);
        }
      });
      row.createEl("span", { text: CONFIG[mode].unit, cls: "dw-unit" });

      setActiveChip(chipsWrap, CONFIG[mode].get());
    };

    const setMode = (mode: Mode) => {
      this.useWordCount = mode === "words";
      renderPicker(mode);
    };

    minutesBtn.onclick = () => setMode("minutes");
    wordsBtn.onclick = () => setMode("words");
    setMode(this.useWordCount ? "words" : "minutes");

    // Buttons
    const btnRow = contentEl.createDiv({ cls: "dw-btn-row" });
    const cancelBtn = btnRow.createEl("button", {
      text: "Cancel",
      cls: "dw-btn",
    });
    cancelBtn.onclick = () => this.close();

    const startBtn = btnRow.createEl("button", {
      text: "Start Zap Session",
      cls: "dw-btn dw-btn-cta",
    });
    startBtn.onclick = () => {
      if (this.useWordCount && this.wordCountGoal <= 0) {
        new Notice("Please enter a valid word count goal");
        return;
      }
      if (!this.useWordCount && this.durationMinutes <= 0) {
        new Notice("Please enter a valid duration");
        return;
      }
      this.result = {
        durationMinutes: this.useWordCount ? null : this.durationMinutes,
        wordCountGoal: this.useWordCount ? this.wordCountGoal : null,
      };
      this.onSubmit(this.result);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class FirstTimeWarningModal extends Modal {
  onConfirm: () => void;

  constructor(app: App, onConfirm: () => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.setTitle("⚠️ Zap");

    contentEl.createEl("p", {
      text: "This plugin deletes content if you stop typing. Practice mode is ON by default.",
      cls: "dw-subtitle",
    });

    const list = contentEl.createEl("ul", { cls: "dw-warning-list" });
    list.createEl("li", { text: "Content is recoverable in practice mode" });
    list.createEl("li", { text: "Test in a safe vault first" });
    list.createEl("li", { text: "Switching files may end the session" });

    const btnRow = contentEl.createDiv({ cls: "dw-btn-row" });
    const cancelBtn = btnRow.createEl("button", {
      text: "Cancel",
      cls: "dw-btn",
    });
    cancelBtn.onclick = () => this.close();

    const confirmBtn = btnRow.createEl("button", {
      text: "I Understand",
      cls: "dw-btn dw-btn-cta",
    });
    confirmBtn.onclick = () => {
      this.onConfirm();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
