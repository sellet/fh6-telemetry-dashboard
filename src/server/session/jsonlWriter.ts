import fs from 'node:fs';
import type { TelemetryFrame } from '../../../shared/telemetry';

/** Cap on frames buffered in memory while the disk stream is draining. */
const MAX_QUEUE = 5000;

/**
 * Appends telemetry frames to a JSONL file, one compact JSON object per line.
 *
 * UDP cannot be paused, so when the write stream signals backpressure frames
 * are held in a bounded queue and drained on 'drain'. If the queue overflows
 * (catastrophically slow disk) the oldest frames are dropped and counted.
 */
export class JsonlWriter {
  private readonly stream: fs.WriteStream;
  private readonly queue: string[] = [];
  private draining = false;
  private closed = false;
  private linesWritten = 0;
  private droppedFrames = 0;

  constructor(filePath: string, onError?: (err: Error) => void) {
    this.stream = fs.createWriteStream(filePath, { flags: 'a' });
    this.stream.on('drain', () => this.drainQueue());
    if (onError) this.stream.on('error', onError);
  }

  write(frame: TelemetryFrame): void {
    if (this.closed) return;
    const line = JSON.stringify(frame) + '\n';

    if (this.draining) {
      if (this.queue.length >= MAX_QUEUE) {
        this.queue.shift();
        this.droppedFrames += 1;
      }
      this.queue.push(line);
      return;
    }

    this.writeLine(line);
  }

  private writeLine(line: string): void {
    const ok = this.stream.write(line);
    this.linesWritten += 1;
    if (!ok) this.draining = true;
  }

  private drainQueue(): void {
    this.draining = false;
    while (this.queue.length > 0) {
      const line = this.queue.shift() as string;
      this.writeLine(line);
      if (this.draining) return;
    }
  }

  get lineCount(): number {
    return this.linesWritten;
  }

  get dropped(): number {
    return this.droppedFrames;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    while (this.queue.length > 0) {
      this.writeLine(this.queue.shift() as string);
    }
    await new Promise<void>((resolve) => {
      this.stream.end(() => resolve());
    });
  }
}
