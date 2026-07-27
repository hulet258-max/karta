import { render, screen } from "@testing-library/react";
import CoinAmount from "./CoinAmount";

test("renders Birr balance amounts in the player UI format", () => {
  render(<CoinAmount value={12.5} />);

  expect(screen.getByText("12.5 Birr")).toBeInTheDocument();
});
