export const INPUT_FORMAT = `=== Final Goal ===
[The final goal that needs to be accomplished]
=== Open Tabs ===
[The open tabs]
=== Current URL ===
[The current URL]
=== Variables ===
[Variables that can be used in the task]
- Variables are referenced using <<name>> syntax
- Each variable has a name and description
- Variables persist across actions and can be referenced in subsequent steps
- Format: <<name>> - {description}
=== Elements ===
[A list of the elements on the page in the following format]
[index]<type attributes...>value</type>
- type: HTML element type (button, input, etc.)
- index: Numeric identifier for interaction 
- attributes: All HTML attributes of the element like type, name, value, class, etc. This can include:
  * Data attributes
  * ARIA attributes 
  * Custom attributes
  * Any other valid HTML attributes
  * The attributes provide important context about the element's behavior, accessibility, and styling
=== Previous Actions ===
[The previous steps of the task]
=== Page Screenshot ===
- A screenshot of the current page with the interactive elements highlighted with their index.
- Each interactive element is drawn as a colored bounding box, and its index is rendered as a small rectangular label with the SAME color as the box border.
- IMPORTANT: The index label is anchored to the TOP-RIGHT corner of its bounding box and drawn ABOVE that corner (the label's bottom-right sits at the box's top-right). It therefore appears OUTSIDE the box, just above it.
- When interactive elements are stacked vertically with no gap between them (e.g. list items, table rows), the label of the lower box will visually sit along the bottom edge of the box directly above it. Do NOT confuse this label with the upper box — the label ALWAYS belongs to the box immediately BELOW it, not the box it appears to touch.
- The label's fill color always matches the border color of its own box, so when in doubt, match colors to determine which box a label belongs to.
=== Page State ===
- Pixels below
- Pixels above`;
