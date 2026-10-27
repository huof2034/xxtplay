/** This authority lives only in memory. Never persist or recreate it from page messages. */
export class ExamSubmissionGate {
  private busy = false;
  private consumed = false;
  constructor(readonly examId: string) {}
  async submit(event: Pick<Event, 'isTrusted'>, examId: string, action: () => Promise<void>): Promise<boolean> {
    if (!event.isTrusted || examId !== this.examId || this.busy || this.consumed) return false;
    this.busy = true;
    // An ambiguous result consumes the gesture too: a new page/review is required, never retry the POST.
    this.consumed = true;
    try { await action(); return true; } finally { this.busy = false; }
  }
  get used(): boolean { return this.consumed; }
}
