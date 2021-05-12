import { NextApiRequest, NextApiResponse } from "next"
import { Readable } from 'stream'
import Stripe from "stripe";
import { stripe } from "../../services/stripe";
import { saveSubscription } from "./_lib/manageSubscription";

// function que converte a requisição de stream para string
async function buffer(readable: Readable) {
    const chunks = [];

    for await (const chunk of readable) {
        chunks.push(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk
        );
    }

    return Buffer.concat(chunks);
}

// acrescentamos essa variável para desabilitar o modo padrão que o next entende requisições
export const config = {
    api: {
        bodyParser: false
    }
}

// quais eventos são relevantes, ou seja, que queremos ouvir.

const relevantsEvents = new Set([ // Set - array que não permite dados repetidos
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
])

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') { // verificação se o método é POST
        const buf = await buffer(req)
        const secret = req.headers['stripe-signature'] // para acessar o código do webhook

        // verificação do código com a variável ambiente conforme documentação do stripe
        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(buf, secret, process.env.STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            return res.status(400).send(`Webhook error: ${err.message}`);
        }

        const type = event.type; // para acessar o tipo de evento

        if (relevantsEvents.has(type)) {
            try {
                switch (type) { // para cada tipo de evento, farei algo diferente
                    case 'customer.subscription.updated':
                    case 'customer.subscription.deleted':
                        const subscription = event.data.object as Stripe.Subscription;

                        await saveSubscription(
                            subscription.id, // id da subscription
                            subscription.customer.toString(), // id do usuário
                            false // só será true se receber esse evento (createAction)
                        );
                        break;

                    case 'checkout.session.completed':
                    
                        // faço a tipagem para acessar os eventos específicos do checkout
                        const checkoutSession = event.data.object as Stripe.Checkout.Session

                        await saveSubscription(
                            checkoutSession.subscription.toString(), // id da subscription
                            checkoutSession.customer.toString(), // id do customer 
                            true // createAction
                        )
                        break;
                    default:
                        throw new Error('Unhandled event') // caso um evento relevante não tenha nenhum tratamento previsto no switch
                }
            } catch (err) {
                return res.json({ error: 'Webhook handler failed' }) // erro de desenvolvimento, não do stripe
            }
        }

        res.json({ received: true })
    } else {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method not allowed')
    }
}