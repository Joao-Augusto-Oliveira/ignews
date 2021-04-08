import { NextApiRequest, NextApiResponse } from "next";
import { query as q } from 'faunadb';
import { getSession } from 'next-auth/client'; // método para acessar o usuário logado
import { fauna } from "../../services/fauna";
import { stripe } from "../../services/stripe";

type User = {
    ref: {
        id: string;        
    }
    data: {
        stripe_customer_id: string;
    }
}
    
export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') { // sempre que for criação no back-end, preciso de 'POST'
       const session = await getSession({req}); // com req acessamos os cookies, que ficam visíveis tanto no front, como no back-end aqui no next.

       const user = await fauna.query<User>(
           q.Get(
               q.Match(
                   q.Index('user_by_email'),
                   q.Casefold(session.user.email)
               )
           )
       )

       let customerId = user.data.stripe_customer_id // acessa o id do banco

       if(!customerId) { // se ele nao existir, cria o id
        const stripeCustomer = await stripe.customers.create({
            email: session.user.email,
            // metadata
        })

        await fauna.query(
            q.Update( // para salvar o id do stripeCustomer no fauna
                q.Ref(q.Collection('users'), user.ref.id),
                {
                    data: {
                        stripe_customer_id: stripeCustomer.id,
                    }
                }
            )
        )

        customerId = stripeCustomer.id // reatribui o valor

    }
       
      const stripeCheckoutSession = await stripe.checkout.sessions.create({
            customer: customerId, // id do customer no stripe
            payment_method_types: ['card'],
            billing_address_collection: 'required', // obrigatoriedade de preenchimento do endereço, poderíamos deixar 'auto' para configurar direto no painel do stripe
            line_items: [
                {price: 'price_1IbEEAFXmkKxKID4WpKomS7B', quantity: 1 } // id do preço gerado no stripe
            ], 
            mode: 'subscription', // pagamento recorrente
            allow_promotion_codes: true, // permite uso de cupons de desconto
            success_url: process.env.STRIPE_SUCCESS_URL,
            cancel_url: process.env.STRIPE_CANCEL_URL
        })

        return res.status(200).json({sessionId: stripeCheckoutSession.id})
    } else {
        res.setHeader('Allow', 'POST'); // explicando para o front-end que o método aceito é 'POST' 
        res.status(405).end('Method not allowed') // devolvo com erro de método não permitido
    }
}