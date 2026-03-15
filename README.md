# Salesforce: Deployed Components Chrome Extension

A lightweight Chrome extension that adds a list of Component Successes to the Deployment Details page.

## Why

Normally, the Deployment Details page shows just the number of deployed components, even though the list of deployed components is available through the API. This extension adds this list to the page, allowing you to see what was deployed in each deployment at a glance.

## How It Works

1. Read Deployment Id `asyncId` from URL params.
2. Read Session Id `sid` cookie for REST API calls.
3. Fetch detailed deployment results through REST API.
4. Generate the Component Successes table mimicing the Classic UI.
5. Inject the table.

## Installation

### Chrome Web Store

- [https://chromewebstore.google.com/detail/aonbddjojkfcjcjkjhadnncmpdpngonm](https://chromewebstore.google.com/detail/aonbddjojkfcjcjkjhadnncmpdpngonm)

### Developer Mode

1. Clone this repo.
2. Go to [chrome://extensions/](chrome://extensions/).
3. Enable Developer mode toggle.
4. Click Load unpacked.
5. Select the `src` folder.

## License

GPL-3.0
