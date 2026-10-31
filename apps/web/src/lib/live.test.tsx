import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { LiveProvider, useLiveEvent, useLiveStatus } from "./live";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: (m: { data: string }) => void;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close() {
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  emit(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

function Probe() {
  const connected = useLiveStatus();
  const [last, setLast] = useState("none");
  useLiveEvent(["ticket.updated"], (e) => setLast(String(e.ticketId)));
  return <p>{connected ? "online" : "offline"} {last}</p>;
}

beforeEach(() => {
  jest.useFakeTimers();
  FakeSocket.instances = [];
  (global as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
});
afterEach(() => jest.useRealTimers());

describe("LiveProvider", () => {
  it("delivers subscribed events and ignores others", () => {
    render(<LiveProvider enabled url="ws://test/ws"><Probe /></LiveProvider>);
    const s = FakeSocket.instances[0]!;
    act(() => s.open());
    expect(screen.getByText(/online/)).toBeInTheDocument();
    act(() => s.emit({ type: "deal.updated", dealId: 1 }));
    expect(screen.getByText("online none")).toBeInTheDocument();
    act(() => s.emit({ type: "ticket.updated", ticketId: 42 }));
    expect(screen.getByText("online 42")).toBeInTheDocument();
  });

  it("reconnects with exponential backoff after the connection drops", () => {
    render(<LiveProvider enabled url="ws://test/ws"><Probe /></LiveProvider>);
    act(() => FakeSocket.instances[0]!.onclose?.());
    expect(screen.getByText(/offline/)).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(999));
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => jest.advanceTimersByTime(1));
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => FakeSocket.instances[1]!.onclose?.());
    act(() => jest.advanceTimersByTime(1999));
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => jest.advanceTimersByTime(1));
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it("does not connect when disabled", () => {
    render(<LiveProvider enabled={false}><Probe /></LiveProvider>);
    expect(FakeSocket.instances).toHaveLength(0);
  });
});
