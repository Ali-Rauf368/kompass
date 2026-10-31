import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../lib/i18n";
import { DataTable, Dialog, Pagination, TextField } from "./ui";

const wrap = (ui: React.ReactNode) => render(<I18nProvider initial="en">{ui}</I18nProvider>);

describe("DataTable", () => {
  const rows = [{ id: 1, name: "Anna" }, { id: 2, name: "Jonas" }];
  const columns = [{ key: "name", header: "Name", cell: (r: { id: number; name: string }) => r.name }];

  it("renders an accessible table with a caption", () => {
    wrap(<DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows an empty state", () => {
    wrap(<DataTable caption="People" columns={columns} rows={[]} rowKey={(r: { id: number }) => r.id} />);
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
  });

  it("calls onRowClick", async () => {
    const onRowClick = jest.fn();
    wrap(<DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText("Jonas"));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });
});

describe("Pagination", () => {
  it("disables previous on the first page and moves forward", async () => {
    const onPage = jest.fn();
    wrap(<Pagination page={1} pages={3} total={60} onPage={onPage} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage).toHaveBeenCalledWith(2);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });
});

describe("TextField", () => {
  it("links the label and the error message", () => {
    wrap(<TextField label="Email" error="Required" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Required");
  });
});

describe("Dialog", () => {
  it("renders content when open and closes via the close button", async () => {
    const onClose = jest.fn();
    wrap(<Dialog open title="Edit" onClose={onClose}><p>Body</p></Dialog>);
    expect(screen.getByText("Body")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
