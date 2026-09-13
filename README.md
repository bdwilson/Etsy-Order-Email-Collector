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

3. **Choose how much to collect**:
   - **Collect every page** (default) walks the pagination on its own until
     there are no more pages.
   - Untick it to read only the page you are looking at — handy when you just
     want today's orders rather than re-reading your whole history.
   - The choice is remembered between runs.

4. **Collection process**:
   - Progress is shown in the popup, but the popup is not required — you can
     close it and collection keeps running in the tab.
   - Click "Stop Collection" to finish early and export what has been collected.

5. **Get the results**:
   - When collection finishes, the orders are pushed to your API if you enabled
     that in Options, and the CSV is downloaded automatically if
     "Also download the CSV automatically" is ticked.
   - Either way a **Download CSV** button appears in the popup, so you can grab
     the file whenever you want instead of being handed a save dialog every run.
     The last run is kept, so the button still works if you reopen the popup later.
   - The CSV has two columns: "Order ID" and "Email"
   - You can then upload the file to your email newsletter service, use it with etsy-lettertrack, or process it with your own business tools.

## Features

- **Collect Order IDs & Emails** - Automatically extract both order IDs and customer email addresses from your Etsy sold orders page
- **Multi-Page Support** - Walks every page of your sold orders on its own, or reads just the page you're on
- **CSV Export** - Download all collected data as a properly formatted CSV file with `Order ID` and `Email` columns, automatically or on demand
- **LetterTrack Compatible** - CSV output format works seamlessly with [etsy-lettertrack](https://github.com/bdwilson/etsy-lettertrack) for order tracking integration
- **Direct Push** - Optionally POST collected orders to any API you point it at, with no CSV to import by hand
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

**If the push fails** — etsy-lettertrack not running, wrong port — the popup
says so and the collected orders are kept, so you can retry or grab them with
the **Download CSV** button. Nothing is lost.

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

## Push API

The push isn't tied to etsy-lettertrack — point the endpoint at any server that
accepts this. One `POST` per collection run (not per order), with
`Content-Type: application/json`:

```json
{
  "contacts": [
    { "email": "buyer@example.com", "order_id": "4147089582" },
    { "email": "someone@example.net", "order_id": "4147089583" }
  ]
}
```

- `order_id` is Etsy's receipt ID, sent as a string.
- Orders with no email address on the Etsy page are left out.
- Sent from the extension's service worker, so CORS is not enforced: your server
  does not need `Access-Control-Allow-Origin` headers. It does need to be a host
  you approved when saving the endpoint.

**Any 2xx counts as success.** The response body is optional — reply with an
empty one if you have nothing to report. If you return JSON, these three arrays
are used (lengths only) to report e.g. "Pushed 13: 13 matched to an order":

```json
{
  "saved":    [ { "email": "buyer@example.com", "order_id": 4147089582 } ],
  "queued":   [ "unmatched@example.com" ],
  "excluded": [ "you@yourshop.com" ]
}
```

Anything else in the body is ignored, and a non-JSON body simply means the count
isn't broken down. A non-2xx status is reported as a failure; the collection is
still kept and the popup's **Download CSV** button still works.

A minimal receiver:

```python
from fastapi import FastAPI
app = FastAPI()

@app.post("/api/contacts")
async def contacts(payload: dict):
    for c in payload.get("contacts", []):
        print(c["order_id"], c["email"])
    return {"saved": payload.get("contacts", [])}
```

## Contributing

Contributions to improve the Etsy Order Email Collector are welcome! Please feel free to submit pull requests or create issues for bugs and feature requests.

## Disclaimer

This extension is not affiliated with, endorsed by, or sponsored by Etsy. It is an independent tool created to assist Etsy sellers. Use at your own discretion and always in compliance with Etsy's terms of service.

## License

[MIT License](LICENSE) (Note: You should add a LICENSE file to your repository)
