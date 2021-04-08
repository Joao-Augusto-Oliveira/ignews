import axios from 'axios';

export const api = axios.create({
    baseURL: '/api' // nao há a necessidade de colocar a url inteira, pois o axios "aproveita" o restante.
})