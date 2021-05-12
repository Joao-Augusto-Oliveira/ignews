import { query as q } from 'faunadb'
import NextAuth from 'next-auth'
import { session } from 'next-auth/client';
import Providers from 'next-auth/providers'

import { fauna } from '../../../services/fauna';

export default NextAuth({
  providers: [
    Providers.GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scope: 'read:user' // autorizações necessárias, nesse caso, a mais básica
    }),
  ],
   callbacks: { 
    async session(session) { // verificando se o usuário tem uma inscrição ativa
      try {
        const userActiveSubscription = await fauna.query(
          q.Get(
            q.Intersection([
              q.Match(
                q.Index('subscription_by_user_ref'),
                q.Select(
                  'ref',
                  q.Get(
                    q.Match(
                      q.Index('user_by_email'),
                      q.Casefold(session.user.email)
                    )
                  )
                )
              ),
              q.Match(
                q.Index('subscription_by_status'),
                'active',
              )
            ])
          )
        )
  
        return {
          ...session,
          activeSubscription: userActiveSubscription
        }        
      } catch {
        return {
          ...session,
          activeSubscription: null,
        }
      }
    },
    async signIn(user, account, profile) {
      const { email } = user

      try {
        await fauna.query(
         q.If( // se nao existe um usuário com o respectivo e-mail
           q.Not(
             q.Exists(
               q.Match(
                 q.Index('user_by_email'), // index criado no fauna
                 q.Casefold(user.email) // para não distinguir maiúsculas e minúsculas
               )
             )
           ),
           q.Create( // cria o usuário com esse e-mail na collection users
             q.Collection('users'),
             { data: { email}}
           ),
           q.Get( // se ele existe, busque pelo e-mail
             q.Match(
               q.Index('user_by_email'),
               q.Casefold(user.email)
             )
           )
         )
      )
        return true
      } catch (error) {
        return false
      }     
    },
  }
})
