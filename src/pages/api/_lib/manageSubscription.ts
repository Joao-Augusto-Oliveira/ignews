import { query as q } from 'faunadb';
import { fauna } from "../../../services/fauna";
import { stripe } from '../../../services/stripe';

export async function saveSubscription(
    subscriptionId: string,
    customerId: string,
    createAction = false, // se é uma ação de criação
    // referente aos eventos de checkout.session.completed e customer.subscriptions.created
) {
    // Buscar o usuário no banco do FaunaDB com o ID {customerId}
    // customerId no fauna é o stripe_customer_id
    // Salvar os dados da subscription no faunaDB

    const userRef = await fauna.query( // vou buscar a ref para relacionar com a subscription - ref é parâmetro padrao do fauna
        q.Select( // método para buscar exatamente qual campo preciso, evitando dados e cobranças desnecessároas
            "ref",
            q.Get(
                q.Match(
                    q.Index('user_by_stripe_customer_id'),
                    customerId
                )
            )
        )
    )

    // para buscar todos os dados da subscription, não só o id
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    // definindo os dados para serem salvos no fauna
    const subscriptionData = {
        id: subscription.id,
        userId: userRef,
        status: subscription.status,
        price_id: subscription.items.data[0].price.id, // qual produto sendo comprado, como estamos vendendo apenas 1 produto, podemos pegar somente a primeira posição
    }

    if (createAction) {
        await fauna.query( // salvar os dados no fauna
            q.Create(
                q.Collection('subscriptions'),
                {data: subscriptionData}
            )
        )
    } else {
        await fauna.query(
            q.Replace( // método para substituir todos os dados do registro
                q.Select( // Replace recebe o parâmetro ref
                    'ref', // buscaremos somente pela ref
                    q.Get(
                        q.Match(
                            q.Index('subscription_by_id'),
                            subscriptionId, // a inscrição do id corrente
                        )
                    )
                ),
                { data : subscriptionData } // substituo todos os dados da inscrição
            )
        )
    }

    
}