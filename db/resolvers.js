
const Usuario = require('../model/usuario');
const Producto = require('../model/producto');
const Cliente = require('../model/cliente');
const Pedido = require('../model/pedido');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cliente = require('../model/cliente');
require('dotenv').config({ path: 'variables.env'});

const crearToken = (usuario, secreta, expiresIn) => {
    const { id, email, nombre, apellido } = usuario;
    return jwt.sign({ id, email, nombre, apellido }, secreta, { expiresIn });
}

const leerToken = async (token, secreta) => {
    const valor = await jwt.verify(token, secreta);
    return valor;
}

const resolvers = {
    Query: {
        obtenerUsuario: async (_, {}, ctx) => {
            return ctx.usuario;
        },
        obtenerProductos: async () => {
            try {
                const productos = await Producto.find({});
                return productos;
            } catch (error) {
                console.log('Error al obtener los productos');
                console.log(error);
            }
        },
        obtenerProducto: async (_, { id }) => {
            //Validar si existe el producto
            const producto = await Producto.findById(id);

            if (!producto) {
                throw new Error('El producto no existe');
            }

            return producto;
        },
        obtenerCliente: async (_, { id }, ctx) => {
            //Revisar si el cliente existe
            const existeCliente = await Cliente.findById(id);
            if (!existeCliente) {
                throw new Error('El cliente no existe');
            }
            
            //Quien lo creo puede ver al cliente
            if (existeCliente.vendedor.toString() !== ctx.usuario.id.toString()){
                throw new Error('No tiene las credenciales');
            }

            return existeCliente;
        },
        obtenerClientes: async () => {
            try {
                const clientes = await Cliente.find({});
                return clientes;
            } catch (error) {
                console.log('Error al obtener los clientes');
                console.log(error);
            }
        },
        obtenerClientesVendedor: async (_, {}, ctx) => {
            try {
                const clientes = await Cliente.find({ vendedor: ctx.usuario.id.toString() });
                return clientes;
            } catch (error) {
                console.log('Error al obtener los clientes por vendedor');
                console.log(error);
            }
        },
        obtenerPedidos: async (_, {}) => {
            try {
                const pedidos = await Pedido.find({});
                return pedidos;
            } catch (error) {
                console.log('Error al obtener los pedidos');
                console.log(error);
            }
        },
        obtenerPedidosVendedor: async (_, {}, ctx) => {
            try {
                const pedidos = await Pedido.find({ vendedor: ctx.usuario.id.toString() }).populate('cliente').populate('pedido.producto');
                return pedidos;
            } catch (error) {
                console.log('Error al obtener los pedidos por vendedor');
                console.log(error);
            }
        },
        obtenerPedido: async (_, {id}, ctx) => {
            //Si existe el pedido
            const pedido = await Pedido.findById(id);
            if(!Pedido){
                throw new Error('El pedido no existe');
            }

            //Pedido pertenece al vendedor que consulta
            if(pedido.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tiene las credenciales')
            }

            return pedido;
        },
        obtenerPedidosEstado: async (_, {estado}, ctx) => {
            const pedidos = await Pedido.find({vendedor: ctx.usuario.id, estado});
            return pedidos;
        },
        mejoresClientes: async () => {
            const clientes = await Pedido.aggregate([
                { 
                    $match: { estado: "COMPLETADO" }
                },
                {
                    //Donde se van almacenar nuevo type TopCliente $cliente y $total
                    $group: { 
                        _id: "$cliente", 
                        total: {
                            $sum: "$total"
                        }
                    }
                },
                {
                    //Relación a ejecutar
                    $lookup: {
                        from: "clientes", //tabla de mongo db
                        localField: "_id",
                        foreignField: "_id",
                        as: "cliente" //atributo de schema
                    }
                },
                {
                    $sort: {
                        total: -1
                    }
                }
            ]);

            return clientes;
        },
        mejoresVendedores: async () => {
            const vendedores = await Pedido.aggregate([
                {
                    $match: { estado: "COMPLETADO" }
                },
                {
                    $group: {
                        _id: "$vendedor",
                        total: {
                            $sum: "$total"
                        }
                    }
                },
                {
                    $lookup: {
                        from: "usuarios",
                        localField: "_id",
                        foreignField: "_id",
                        as: "vendedor"
                    }
                },
                {
                    $sort: {
                        total: -1
                    }
                }
            ]);

            return vendedores;
        },
        buscarProducto: async (_, {texto}) => {
            const productos = await Producto.find({ $text: { $search: texto }}).limit(10);
            return productos;
        }
    },
    Mutation: {
        nuevoUsuario: async (_, {input}) => {
            const { email, password } = input;
            
            //Si el usuario existe
            const existeUsuario = await Usuario.findOne({email});
            if (existeUsuario){
                throw new Error('El usuario ya esta registrado');
            }
            //Hashear su password
            const salt = await bcryptjs.genSalt(10);
            input.password = await bcryptjs.hash(password, salt);

            //Guardar en la base de datos
            try {
                const usuario = new Usuario(input);
                usuario.save();
                return usuario;
            } catch (error) {
                console.log('Error al crear el usuario');
                console.log(error);
            }
        },
        autenticarUsuario: async (_, {input}) => {
            const { email, password } = input;
            
            //Si el usuario existe
            const existeUsuario = await Usuario.findOne({email});
            if (!existeUsuario){
                throw new Error('El usuario no esta registrado');
            }

            //Revisar si el password es correcto
            const passwordCorrecto = await bcryptjs.compare(password, existeUsuario.password);
            if (!passwordCorrecto){
                throw new Error('El password es incorrecto')
            }

            //token 
            return {
                token: crearToken(existeUsuario, process.env.SECRETA, '24h')
            }
        },
        nuevoProducto:  async (_, {input}) => {
            try {
                const producto = new Producto(input);
                await producto.save();
                return producto;
            } catch (error) {
                console.log('Error al crear producto');
                console.log(error);
            }
        },
        actualizarProducto: async (_, { id, input }) => {
            //Validar si existe el producto
            let producto = await Producto.findById(id);

            if (!producto) {
                throw new Error('El producto no existe');
            }

            //Guardar producto
            producto = await Producto.findByIdAndUpdate({ _id: id }, input, { new: true });
            return producto;
        },
        eliminarProducto: async (_, { id }) => {
            //Validar si existe el producto
            let producto = await Producto.findById(id);

            if (!producto) {
                throw new Error('El producto no existe');
            }
            
            //Eliminar producto
            await Producto.findByIdAndRemove({ _id: id});
            return "Producto eliminado";
        },
        nuevoCliente: async (_, { input }, ctx) => {
            const { email } = input;
            
            //Verificar si el cliente esta registrado
            const existeCliente = await Cliente.findOne({ email });
            if (existeCliente) {
                throw new Error('El cliente ya se encuentra registrado');
            }

            //Creando objeto
            const cliente = new Cliente(input);
            
            //Asignar vendedor
            cliente.vendedor = ctx.usuario.id;
            
            //Guardar cliente
            try {
                await cliente.save();
                return cliente;
            } catch (error) {
                console.log('Error al crear cliente');
                console.log(error);
            }
        },
        actualizarCliente: async (_, { id, input }, ctx) => {
            //Revisar si el cliente existe
            let cliente = await Cliente.findById(id);
            if (!cliente) {
                throw new Error('El cliente no existe');
            }
            
            //Quien lo creo puede ver al cliente
            if (cliente.vendedor.toString() !== ctx.usuario.id.toString()){
                throw new Error('No tiene las credenciales');
            }

            //Guardar cliente
            cliente = await Cliente.findByIdAndUpdate({_id: id}, input, {new: true});
            return cliente
        },
        eliminarCliente: async (_, {id}, ctx) => {
            //Revisar si el cliente existe
            let cliente = await Cliente.findById(id);
            if (!cliente) {
                throw new Error('El cliente no existe');
            }
            
            //Quien lo creo puede ver al cliente
            if (cliente.vendedor.toString() !== ctx.usuario.id.toString()){
                throw new Error('No tiene las credenciales');
            }

            //Eliminar cliente
            await Cliente.findByIdAndDelete({_id: id});
            return "Cliente eliminado";
        },
        nuevoPedido: async (_, {input}, ctx) => {
            //Verificar si el cliente existe
            const { cliente } = input;
            const existeCliente = await Cliente.findById(cliente);
            if (!existeCliente) {
                throw new Error('El cliente no existe');
            }

            //Verificar si el cliente pertenece al vendedor
            if (existeCliente.vendedor.toString() !== ctx.usuario.id.toString()){
                throw new Error('No tiene las credenciales');
            }

            //Revisar stock
            for await (const pedido of input.pedido) {
                const { producto } = pedido;
                const productoExiste = await Producto.findById(producto);
                
                if (!productoExiste) {
                    throw new Error(`El producto no existe`);
                }

                if (pedido.cantidad > productoExiste.existencia) {
                    throw new Error(`El producto: ${productoExiste.nombre} excede la cantidad disponible`);
                }
                else {
                    productoExiste.existencia = productoExiste.existencia - pedido.cantidad;
                    await productoExiste.save();
                }
            }

            //Crear pedido y asignar vendedor
            let pedido = new Pedido(input);
            pedido.vendedor = ctx.usuario.id;

            //Guardar pedido
            try {
                await pedido.save();
                return pedido;
            } catch (error) {
                console.log('Error al crear pedido');
                console.log(error);
            }
        },
        actualizarPedido: async (_, {id, input}, ctx) => {
            const { cliente } = input;

            //Si el pedido existe
            const existePedido = await Pedido.findById(id);
            if(!existePedido){
                throw new Error('El pedido no existe');
            }

            //Si el cliente existe
            const existeCliente = await Cliente.findById(cliente);
            if(!existeCliente){
                throw new Error('El cliente no existe');
            }

            //Si el cliente y pedido pertenece al vendedor
            if (existePedido.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tiene credenciales para el pedido');
            }

            if (existeCliente.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tiene credenciales para el cliente');
            }

            //Revisar stock
            if(input.pedido) {
                for await (const pedido of input.pedido) {
                    const { id, cantidad } = pedido;
                    const producto = await Producto.findById(id);
    
                    if (!producto) {
                        throw new Error(`El producto: ${producto.nombre} no existe`);
                    }
    
                    if ((pedido.cantidad + cantidad) > producto.existencia) {
                        throw new Error(`El producto: ${producto.nombre} excede la cantidad disponible`);
                    }
                    else {
                        producto.existencia = producto.existencia - (pedido.cantidad + cantidad);
                        await producto.save();
                    }
                }
            }

            //Guardar el pedido
            const pedido = await Pedido.findByIdAndUpdate({_id: id}, input, { new: true });
            return pedido;
        },
        eliminarPedido: async (_, {id}, ctx) => {
            const pedido = await Pedido.findById(id);
            //Verificar si el pedido existe
            if(!pedido){
                throw new Error('El pedido no existe');
            }
    
            //Verificar si pertenece al vendedor
            if (pedido.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tiene credenciales');
            }
    
            //Retornar stock
            if(pedido.pedido) {
                for await (const pedidoItem of pedido.pedido) {
                    const { id, cantidad } = pedidoItem;
                    const producto = await Producto.findById(id);
    
                    if (!producto) {
                        throw new Error(`El producto: ${producto.nombre} no existe`);
                    }
                    
                    producto.existencia = producto.existencia + cantidad;
                    await producto.save();
                }
            }

            //Eliminar pedido
            await Pedido.findByIdAndDelete({_id: id});
            return "Pedido eliminado";
        }
    }
};

module.exports = resolvers;