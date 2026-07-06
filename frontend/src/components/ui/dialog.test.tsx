import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "@/components/ui/dialog";

describe("Dialog", () => {
  it("Dialog renders nothing when open is false", () => {
    render(
      <Dialog open={false} onClose={vi.fn()}>
        content
      </Dialog>,
    );

    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("Clicking the overlay calls onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog open={true} onClose={onClose}>
        content
      </Dialog>,
    );

    const overlay = container.querySelector(".fixed");
    expect(overlay).not.toBeNull();

    fireEvent.click(screen.getByText("content"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose}>
        content
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
