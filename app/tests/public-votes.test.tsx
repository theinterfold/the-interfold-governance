import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicVotes } from "../components/proposalVoting/publicVotes";

describe("Public vote activity read states", () => {
  test("a pending first read does not claim zero votes", () => {
    const html = renderToStaticMarkup(<PublicVotes votes={[]} isLoading={true} hasLoaded={false} />);
    expect(html).toContain("Loading public votes…");
    expect(html).not.toContain("No votes cast.");
    expect(html).not.toContain('class="proposal-detail-count"');
  });

  test("a failed first read offers retry without claiming zero votes", () => {
    const html = renderToStaticMarkup(<PublicVotes votes={[]} isError={true} hasLoaded={false} onRetry={() => {}} />);
    expect(html).toContain("Could not load public votes right now.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).not.toContain("No votes cast.");
    expect(html).not.toContain('class="proposal-detail-count"');
  });

  test("only a completed successful read establishes an empty vote list", () => {
    const html = renderToStaticMarkup(<PublicVotes votes={[]} hasLoaded={true} />);
    expect(html).toContain("No votes cast.");
    expect(html).toContain('class="proposal-detail-count">0</span>');
    expect(html).not.toContain("Loading public votes");
  });

  test("refreshing a previously empty list does not present its old emptiness as current", () => {
    const html = renderToStaticMarkup(<PublicVotes votes={[]} isLoading={true} hasLoaded={true} />);
    expect(html).toContain("Updating public votes…");
    expect(html).not.toContain("No votes cast.");
  });

  test("a failed refresh identifies the retained data as previously loaded", () => {
    const html = renderToStaticMarkup(<PublicVotes votes={[]} isError={true} hasLoaded={true} />);
    expect(html).toContain("Could not refresh public votes. Showing the last loaded votes.");
    expect(html).not.toContain("No votes cast.");
  });
});
