/**
 * Plain Prompt Adapter
 *
 * PromptPort implementation that uses Node's readline module for
 * console-style interactive prompts. No box-drawing characters,
 * no @clack/prompts dependency -- visually consistent with
 * createPlainOutput().
 *
 * Used when the CLI commits to "plain" output mode on a TTY.
 */

import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type {
  PromptPort,
  PromptChoice,
  PromptGroupChoices,
  TextPromptOptions,
} from '@opkg/core/core/ports/prompt.js';
import { UserCancellationError } from '@opkg/core/utils/errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a one-shot readline interface, auto-closing on completion. */
function createRl(): ReadlineInterface {
  return createInterface({
    input: process.stdin,
    output: process.stderr, // prompts go to stderr so stdout stays clean for piping
    terminal: true,
  });
}

/** Read a single line, handling Ctrl-C / EOF as cancellation. */
function askLine(rl: ReadlineInterface, query: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
    rl.once('close', () => {
      reject(new UserCancellationError('Prompt cancelled'));
    });
    rl.once('SIGINT', () => {
      rl.close();
      reject(new UserCancellationError('Prompt cancelled'));
    });
  });
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createPlainPrompt(): PromptPort {
  return {
    // ── confirm ──────────────────────────────────────────────────────
    async confirm(message: string, initial?: boolean): Promise<boolean> {
      const hint = initial ? '[Y/n]' : '[y/N]';
      const rl = createRl();
      try {
        const answer = await askLine(rl, `${message} ${hint}: `);
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === '') return initial ?? false;
        return trimmed === 'y' || trimmed === 'yes';
      } finally {
        rl.close();
      }
    },

    // ── select ───────────────────────────────────────────────────────
    async select<T>(
      message: string,
      choices: Array<PromptChoice<T>>,
      _hint?: string,
    ): Promise<T> {
      const rl = createRl();
      try {
        console.error(message);
        for (let i = 0; i < choices.length; i++) {
          const desc = choices[i].description ? ` - ${choices[i].description}` : '';
          console.error(`  ${i + 1}. ${choices[i].title}${desc}`);
        }

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const answer = await askLine(rl, 'Enter selection: ');
          const num = parseInt(answer.trim(), 10);
          if (num >= 1 && num <= choices.length) {
            return choices[num - 1].value;
          }
          console.error(`Please enter a number between 1 and ${choices.length}.`);
        }
      } finally {
        rl.close();
      }
    },

    // ── multiselect ──────────────────────────────────────────────────
    async multiselect<T>(
      message: string,
      choices: Array<PromptChoice<T>>,
      options?: { hint?: string; min?: number },
    ): Promise<T[]> {
      const rl = createRl();
      try {
        console.error(message);
        for (let i = 0; i < choices.length; i++) {
          const desc = choices[i].description ? ` - ${choices[i].description}` : '';
          console.error(`  ${i + 1}. ${choices[i].title}${desc}`);
        }

        const min = options?.min ?? 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const answer = await askLine(rl, 'Enter selections (comma-separated): ');
          const nums = answer
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n));

          const valid = nums.every((n) => n >= 1 && n <= choices.length);
          if (!valid) {
            console.error(`Please enter numbers between 1 and ${choices.length}, separated by commas.`);
            continue;
          }

          const unique = [...new Set(nums)];
          if (unique.length < min) {
            console.error(`Please select at least ${min} item${min === 1 ? '' : 's'}.`);
            continue;
          }

          return unique.map((n) => choices[n - 1].value);
        }
      } finally {
        rl.close();
      }
    },

    // ── groupMultiselect ─────────────────────────────────────────────
    async groupMultiselect<T>(
      message: string,
      groups: PromptGroupChoices<T>,
    ): Promise<T[]> {
      const rl = createRl();
      try {
        console.error(message);

        // Build flat indexed list with group headers
        const flatItems: Array<{ value: T }> = [];
        for (const [groupLabel, items] of Object.entries(groups)) {
          console.error(`  ${groupLabel}:`);
          for (const item of items) {
            flatItems.push({ value: item.value });
            console.error(`    ${flatItems.length}. ${item.label}`);
          }
        }

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const answer = await askLine(rl, 'Enter selections (comma-separated): ');
          const nums = answer
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n));

          const valid = nums.every((n) => n >= 1 && n <= flatItems.length);
          if (!valid || nums.length === 0) {
            console.error(`Please enter numbers between 1 and ${flatItems.length}, separated by commas.`);
            continue;
          }

          return [...new Set(nums)].map((n) => flatItems[n - 1].value);
        }
      } finally {
        rl.close();
      }
    },

    // ── text ─────────────────────────────────────────────────────────
    async text(
      message: string,
      options?: TextPromptOptions,
    ): Promise<string> {
      const rl = createRl();
      try {
        const placeholder = options?.placeholder ? ` (${options.placeholder})` : '';
        const initial = options?.initial ?? '';
        const query = initial
          ? `${message}${placeholder} [${initial}]: `
          : `${message}${placeholder}: `;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const answer = await askLine(rl, query);
          const value = answer.trim() || initial;

          if (options?.validate) {
            const result = await options.validate(value);
            if (typeof result === 'string') {
              console.error(`  Error: ${result}`);
              continue;
            }
          }

          return value;
        }
      } finally {
        rl.close();
      }
    },
  };
}
