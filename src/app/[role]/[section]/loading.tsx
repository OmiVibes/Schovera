// The shared role shell lives in the root layout and remains interactive while
// Next.js prefetches a section route. Returning no page-level placeholder avoids
// flashing a second full-screen loader during ordinary navigation.
export default function SectionLoading() {
  return null;
}
