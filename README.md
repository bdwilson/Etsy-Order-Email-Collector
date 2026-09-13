# Etsy Order Email Collector

Etsy Order Email Collector is a Chrome extension designed to help Etsy sellers efficiently collect customer email addresses and order IDs from their Sold Orders page. This tool streamlines the process of gathering customer contact information and mapping it to specific orders for marketing purposes, customer service follow-ups, order tracking, or integration with other business tools like LetterTrack.

## Download & Install

1. **Download**: 
   - Clone this repository or download it as a ZIP file.
   - Extract the files to a folder on your computer.

2. **Install in Chrome**:
   - Open Google Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner.
   - Click "Load unpacked" and select the folder containing the extension files.
   - The Etsy Order Email Collector should now appear in your extensions list.

## Usage

1. **Navigate to your Etsy Sold Orders page**:
   - Go to `https://www.etsy.com/your/orders/sold`
   - Make sure you're logged into your Etsy seller account.

2. **Start the collection**:
   - Click on the Etsy Order Email Collector extension icon in your Chrome toolbar.
   - In the popup, click "Start Collecting Orders".

3. **Collection process**:
   - The extension will automatically collect Order IDs and email addresses from the current page.
   - After each page, you'll be prompted to continue to the next page or finish.
   - Click "Continue to Next Page" to proceed or "Finish and Download" when done.

4. **Download results**:
   - Once you've finished or there are no more pages, a CSV file containing all collected Order IDs and email addresses will be downloaded automatically.
   - The CSV has two columns: "Order ID" and "Email"
   - You can then upload the file to your email newsletter service, use it with etsy-lettertrack, or process it with your own business tools.

## Features

- **Collect Order IDs & Emails** - Automatically extract both order IDs and customer email addresses from your Etsy sold orders page
- **Multi-Page Support** - Easily navigate through multiple pages of orders with a simple UI
- **CSV Export** - Download all collected data as a properly formatted CSV file with `Order ID` and `Email` columns
- **LetterTrack Compatible** - CSV output format works seamlessly with [etsy-lettertrack](https://github.com/bdwilson/etsy-lettertrack) for order tracking integration
- **Direct Push** - Optionally send collected orders straight into a running etsy-lettertrack instance, with no CSV to import by hand
- **Customizable Settings** - Configure export options via the settings panel

## Privacy & Ethical Use

- This tool is intended for legitimate business purposes only. Always respect your customers' privacy and comply with relevant data protection laws (like GDPR, CAN-SPAM, etc.).
- Use the collected email addresses and order information responsibly. Ensure you have the right to contact these customers and provide an easy way to opt-out of communications.

## Troubleshooting

- If the extension doesn't work, try refreshing the Etsy Sold Orders page and starting again.
- Ensure you're on the correct Etsy page (`https://www.etsy.com/your/orders/sold`) before starting the collection.
- If issues persist, try disabling and re-enabling the extension, or reinstall it.

## Using with etsy-lettertrack

The Etsy Order Email Collector is designed to work with [etsy-lettertrack](https://github.com/bdwilson/etsy-lettertrack), a tool that bridges Etsy orders to LetterTrack Pro supplemental tracking.

### Option A — push directly (no CSV)

1. Start etsy-lettertrack (`docker compose up`) so it's listening on `http://localhost:8000`.
2. Open this extension's **Options** and tick **"Send collected orders to
   etsy-lettertrack when collection finishes"**. Leave the endpoint at its
   default unless you run it on another port.
3. Collect orders as usual. When you finish, each Order ID + Email pair is
   posted to etsy-lettertrack and linked to the matching order immediately.

Because this extension reads Etsy's own order data, the order number is known
exactly — so addresses are linked outright rather than guessed. (etsy-lettertrack
queues addresses that arrive *without* an order number for manual review, since a
wrong match there would email one buyer another buyer's order details. Pushing
from this extension avoids that path entirely.)

Your own seller address is dropped on the receiving end rather than stored, and
the endpoint only accepts requests from the local machine.

**If the push fails** — etsy-lettertrack not running, wrong port — a CSV is
downloaded anyway, so a collection run is never lost. The popup says what
happened.

**Using a different port or host?** Change the endpoint in Options and approve
the permission prompt Chrome shows. Chrome blocks requests to hosts the
extension hasn't been granted, so skipping that prompt makes the push fail at
send time.

### Option B — export the CSV

1. Use this extension to collect Order IDs and customer emails from your Etsy sold orders
2. Export the CSV file containing Order ID and Email columns
3. Paste or import it into etsy-lettertrack's `/contacts` screen

Either way, the Order ID column maps to Etsy receipt IDs, which etsy-lettertrack
uses for:
   - Generating LetterTrack-format CSVs for batch import
   - Compositing LetterTrack IMb barcodes onto Etsy shipping labels
   - Tracking orders through USPS Informed Visibility
   - Emailing buyers their Etsy and LetterTrack tracking details

This creates a complete workflow for Etsy sellers who want supplemental USPS tracking alongside their existing Etsy postage labels.

### Push API

The endpoint is `POST /api/contacts` and takes:

```json
{"contacts": [{"email": "buyer@example.com", "order_id": "4147089582"}]}
```

It replies with what it did, which is what the popup reports:

```json
{
  "saved": [{"email": "buyer@example.com", "order_id": 4147089582}],
  "queued": [],
  "excluded": ["you@yourshop.com"],
  "pending_total": 0,
  "review_url": "http://localhost:8000/contacts/pending"
}
```

## Contributing

Contributions to improve the Etsy Order Email Collector are welcome! Please feel free to submit pull requests or create issues for bugs and feature requests.

## Disclaimer

This extension is not affiliated with, endorsed by, or sponsored by Etsy. It is an independent tool created to assist Etsy sellers. Use at your own discretion and always in compliance with Etsy's terms of service.

## License

[MIT License](LICENSE) (Note: You should add a LICENSE file to your repository)
