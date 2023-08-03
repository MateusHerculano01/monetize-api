const express = require("express");
const morgan = require("morgan");
const app = express();
const stripe = require("stripe")(
  "sk_test_51MoraBIQlJtrIMpZKIOZKWsDgiq39SJdX3DPfER8ijU8ocVbxVw9zR2iB838UlSnPpCVNMI72rwj3AT3j3kA2zmg001uNSAF18"
);

// This is your Stripe CLI webhook secret for testing your endpoint locally.
const endpointSecret =
  "whsec_d81bc04d4d42ebf69f0ea4d02d68fcc4520dbc300e88e6c7e246de31be8b097a";

// Define a função personalizada para formatar o log
const customFormat = function (tokens, req, res) {
  return [
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens["response-time"](req, res),
    "ms",
  ].join(" ");
};

// TODO Implement a real database
// Reverse mapping of stripe to API key. Model this in your preferred database.
const customers = {
  // stripeCustomerId : data
  cus_NaBJbIcGOx7x99: {
    apiKey: "d07c1fbd5c393ea1bafa0f6171e9afb9fb37656fc4df4fa7ef9d35e9210cb705",
    active: true,
    itemId: "si_NaBJ111VbJDgLz",
  },
};

const apiKeys = {
  d07c1fbd5c393ea1bafa0f6171e9afb9fb37656fc4df4fa7ef9d35e9210cb705:
    "cus_NaBJbIcGOx7x99",
};

// Configura o morgan com a função personalizada
app.use(morgan(customFormat));
// app.use(
//   express.json({ verify: (req, res, buffer) => (req["rawBody"] = buffer) })
// );

app.get("/api", async (req, res) => {
  const { apiKey } = req.query;

  if (!apiKey) {
    return res.sendStatus(400); // bad request
  }

  const hashedAPIKey = hashAPIKey(apiKey);
  const customerId = apiKeys[hashedAPIKey];
  const customer = customers[customerId];

  if (!customer || !customer.active) {
    return res.sendStatus(403); // not authorized
  } else {
    // Record usage with Stripe Billing
    const record = await stripe.subscriptionItems.createUsageRecord(
      customer.itemId,
      {
        quantity: 1,
        timestamp: "now",
        action: "increment",
      }
    );

    return res.send({ data: "🔥🔥", usage: record });
  }
});

app.get("/usage/:customer", async (req, res) => {
  const customerId = req.params.customer;
  const invoice = await stripe.invoices.retrieveUpcoming({
    customer: customerId,
  });

  res.send(invoice);
});

app.post("/checkout", async (req, res) => {
  const sessions = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: "price_1MouGQIQlJtrIMpZwX8bkg0E",
      },
    ],
    success_url: "http://localhost:5000/succcss?session_id=1",
    cancel_url: "http://localhost:5000/error",
  });

  res.send(sessions);
});

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    const sig = request.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    let data = event.data;
    let eventType = event.type;
    // Handle the event
    switch (eventType) {
      case "checkout.session.completed":
        console.log(data);

        // Data included in the event object:
        const customerId = data.object.customer;
        const subscriptionId = data.object.subscription;

        console.log(
          `💰 Customer ${customerId} subscribed to plan ${subscriptionId}`
        );

        // Get the subscription. The First item is the plan the user subscribed to.
        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId
        );
        const itemId = subscription.items.data[0].id;

        // Generate API key
        const { apiKey, hashedAPIKey } = generateAPIKey();
        console.log(`User API key: ${apiKey}`);
        console.log(`Hashed API key: ${hashedAPIKey}`);
        console.log(`ItemId: ${itemId}`);

        break;
      case "payment_intent.succeeded":
        const paymentIntentSucceeded = event.data.object;
        // Then define and call a function to handle the event payment_intent.succeeded
        // console.log(paymentIntentSucceeded);
        break;
      // ... handle other event types
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    response.send();
  }
);

// Recursive function to generate a unique random string as APIKEY
function generateAPIKey() {
  const { randomBytes } = require("crypto");
  const apiKey = randomBytes(16).toString("hex");
  const hashedAPIKey = hashAPIKey(apiKey);

  // Ensurer API key is unique
  if (apiKeys[hashedAPIKey]) {
    generateAPIKey();
  } else {
    return { hashedAPIKey, apiKey };
  }
}

// Hash the API Key
function hashAPIKey(apiKey) {
  const { createHash } = require("crypto");
  const hashedAPIKey = createHash("sha256").update(apiKey).digest("hex");

  return hashedAPIKey;
}

app.listen(3333, () => console.log("listening on port 3333 🚀"));
