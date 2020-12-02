const { ApolloServer } = require('apollo-server');
const typeDefs = require('./db/schema');
const resolvers = require('./db/resolvers');
const connectionDB = require('./config/db');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'variables.env'});

//ConnectionDB
connectionDB();

//server
const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({req}) => {
        const token = req.headers['authorization'] || '';
        if(token) {
            try {
                const usuario = jwt.verify(token.replace('Bearer ', ''), process.env.SECRETA);
                return {
                    usuario
                }
            } catch (error) {
                console.log('Error de acceso');
                console.log(error);
            }
        }
    }
});

//run
server.listen().then( ({url}) => {
    console.log(`Server Success. Url ${url}`);
});