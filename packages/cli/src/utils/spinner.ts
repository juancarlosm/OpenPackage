/**
 * Ora-backed spinner utility for showing loading indicators in plain/non-interactive CLI mode.
 *
 * Wraps the `ora` package to provide a simple API surface
 * (.start / .update / .stop / .succeed) consumed by createPlainOutput().
 */

import ora, { type Ora } from 'ora';

export class Spinner {
  private spinner: Ora;

  constructor(message: string = 'Loading...') {
    this.spinner = ora({ text: message, spinner: 'dots' });
  }

  /**
   * Start the spinner animation
   */
  start(): void {
    this.spinner.start();
  }

  /**
   * Update the spinner message
   */
  update(message: string): void {
    this.spinner.text = message;
  }

  /**
   * Stop the spinner (clears the line)
   */
  stop(): void {
    this.spinner.stop();
  }

  /**
   * Stop the spinner with a success checkmark and final message
   */
  succeed(message: string): void {
    this.spinner.succeed(message);
  }
}
