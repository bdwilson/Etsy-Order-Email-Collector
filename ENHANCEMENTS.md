# Enhancements: Order ID Capture & Integration with etsy-lettertrack

## Summary

The Etsy Order Email Collector Chrome extension has been extended to capture **Order IDs alongside email addresses**, enabling seamless integration with the [etsy-lettertrack](https://github.com/bdwilson/etsy-lettertrack) project for comprehensive order tracking and supplemental USPS labeling.

## What Changed

### Core Functionality
- **Order ID Extraction**: The extension now automatically captures Etsy order IDs (receipt IDs) from each order row
- **Paired Data Structure**: Orders are collected as `{orderId, email}` tuples, maintaining the relationship between order and customer
- **Enhanced CSV Export**: Downloads include two columns: `Order ID` and `Email`
- **Backward Compatible**: Email collection remains the primary function, now enhanced with order information

### Technical Improvements

#### Data Collection (`content.js`)
```javascript
// New data structure
ordersCollected = [
  { orderId: "123456789", email: "customer@example.com" },
  { orderId: "987654321", email: "another@example.com" }
]
```

**Extraction Strategy** (`etsyOrderParser.js`): Order IDs and emails are not reliably present as text in the rendered DOM, so they are read from the `Etsy.Context` JSON that Etsy embeds in an inline `<script>` tag:

- `orders_search.buyers[]` provides `buyer_id` → `email`
- `orders_search.orders[]` provides `order_id` → `buyer_id`
- The two are joined on `buyer_id` to pair each order with its customer

Only the `orders_search` sub-object is parsed, not the whole ~200KB context blob, so an unrelated malformed field elsewhere cannot wipe out the entire page's results.

Note that a content script cannot read `window.Etsy` directly — content scripts run in an isolated world — which is why the script tag's text is parsed instead.

#### CSV Export (`background.js`)
- Properly formatted CSV with headers: `Order ID,Email`
- Correct quote escaping for special characters
- Compatible with LetterTrack format expectations

#### UI Updates (`popup.html` & `popup.js`)
- Button text changed from "Start Collecting Emails" → "Start Collecting Orders"
- Status messages now report "X order(s)" instead of "X emails"
- Settings button (⚙️) provides access to configuration

#### Configuration System (`options.html` & `options.js`)
- New options page accessible via extension icon
- Settings stored in `chrome.storage.sync` for cross-device sync
- Current options:
  - Include Order ID in export (always enabled for now)
  - Clear collected data after export
  - Future extensibility for additional integrations

### Manifest Updates (`manifest.json`)
```json
{
  "version": "2.0",
  "permissions": ["storage"],
  "options_page": "options.html"
}
```

## Integration with etsy-lettertrack

### CSV Format Compatibility

The exported CSV directly maps to LetterTrack fields:
- `Order ID` → `Order Number` column in LetterTrack CSV
- `Email` → `Recipient Email` column

This enables a streamlined workflow:

```
1. Collect orders via this extension
   ↓
2. Download CSV (Order ID, Email)
   ↓
3. Use with etsy-lettertrack to:
   - Generate full LetterTrack CSVs (with address/shipping info from Etsy API)
   - Process orders for USPS Informed Visibility tracking
   - Composite USPS IMb barcodes onto existing Etsy labels
   ↓
4. Print consolidated labels with tracking
```

### Sample CSV Output

```csv
Order ID,Email
123456789,"customer@example.com"
987654321,"another@example.com"
234567890,"third.customer@example.com"
```

## Future Enhancement Opportunities

### Potential Features (Not Implemented Yet)
1. **Direct API Submission**: POST collected orders to etsy-lettertrack's `/export-csv` endpoint
2. **Batch Processing**: Automatically process collected orders through lettertrack API
3. **Status Tracking**: Store and display which orders have been processed through lettertrack
4. **Duplicate Detection**: Warn about duplicate order IDs in collection
5. **Filtering Options**: Filter orders by date range, shipping status, or customer
6. **Bulk Operations**: Combine multiple export sessions for comprehensive order runs

### Why Not Implemented Yet
The etsy-lettertrack project is a local web app that fetches full receipt data from Etsy API. Direct integration would require:
- Either exposing an HTTP API endpoint on lettertrack (not currently done)
- Or implementing Etsy API authentication in the extension (adds complexity)

The current CSV-based approach is simple, reliable, and keeps concerns separated.

## Testing Notes

### Verification Steps
1. Install extension in Chrome: `chrome://extensions` → Load unpacked
2. Navigate to `https://www.etsy.com/your/orders/sold`
3. Click extension icon, then "Start Collecting Orders"
4. Extension should:
   - Wait ~5 seconds for page to load
   - Display "Collected X order(s) from 1 page(s)"
   - Show pagination buttons
5. Download CSV and verify:
   - File contains `Order ID,Email` headers
   - Each row has both values separated by comma
   - Special characters (quotes, commas) are properly escaped

### Known Limitations
- Order ID selector is best-effort; relies on Etsy's current DOM structure
- May need adjustment if Etsy updates their order page layout
- Pagination detection uses `.btn-group button[title="Next page"]` selector (subject to change)

## Files Modified/Created

- `content.js` - Enhanced order collection logic
- `background.js` - Updated CSV export with Order ID column
- `popup.js` - UI updates for order collection
- `popup.html` - Updated button labels and added settings
- `manifest.json` - Added storage permission, options_page, version bump
- `options.html` - New settings page (created)
- `options.js` - Settings management (created)
- `README.md` - Updated with features and integration guide

## Backward Compatibility

✅ **Fully compatible with existing usage**
- Extension behavior appears unchanged to existing users
- CSV format change is additive (adds Order ID column)
- Settings gracefully default to enabled state

## Version History

- **v1.0** - Original email collection only
- **v2.0** - Added Order ID capture, settings page, etsy-lettertrack integration guide

---

**For questions or issues**, please refer to the README or check the etsy-lettertrack project documentation at https://github.com/bdwilson/etsy-lettertrack
