const {ProductModel} = require("../database/models/productsModel");
const {CategoryModel} = require("../database/models/categoriesModel");
const {ManufactureModel} = require("../database/models/manufacturesModel");
const {UnitModel} = require("../database/models/unitsModel");
const {OrderModel} = require("../database/models/ordersModel");
const {OrderitemModel} = require("../database/models/orderitemModel");
const {Op} = require("sequelize");

class OrderModules {
    async newOrder(userData, queryValue) {

        const validateProductsRes = await this.validateProducts(queryValue);

        if (validateProductsRes.status === "error") {
            return validateProductsRes;
        }

        return await this.addProductsToOrder(userData, queryValue);
    }

    async orderInfo(userData, queryValue, idOrder) {

        const sortedQueryValue = queryValue.sort((a, b) => a.id - b.id)
        const prodIdArr = sortedQueryValue.map(el => el.id).sort((a, b) => a - b)
        const prodAmountArr = queryValue.map(el => el.count)

        const prodInfo = await ProductModel.findAll({
            where: {
                id_product: {
                    [Op.in]:  prodIdArr,
                }
            },
            attributes: [
                "id_product",
                "product",
                "price",
            ],
            include: [
                {
                    model: CategoryModel,
                    required: true,
                    attributes: ["category"],
                },
                {
                    model: UnitModel,
                    required: true,
                    attributes: ["unit"],
                },
                {
                    model: ManufactureModel,
                    attributes: ["manufacture"],
                    required: true,
                }
            ],
        })

        const orderInfoObj = {
            user: {
                name: userData.name,
                phone: userData.phone,
                email: userData.email
            },
            orderProducts: [],
            otherInfo: {
                id_order: idOrder[idOrder.length - 1].id_order,
                total_price: ""
            }
        }

        prodInfo.map((el, index) => {
            orderInfoObj.orderProducts.push(el.dataValues);
            orderInfoObj.orderProducts[index].Unit = orderInfoObj.orderProducts[index].Unit.dataValues.unit;
            orderInfoObj.orderProducts[index].Category = orderInfoObj.orderProducts[index].Category.dataValues.category;
            orderInfoObj.orderProducts[index].Manufacture = orderInfoObj.orderProducts[index].Manufacture.dataValues.manufacture;

        })

        orderInfoObj.orderProducts.map((el, index) => {
            return el.count = prodAmountArr[index]
        })

        orderInfoObj.orderProducts.map((el) => {
            el.product_price = el.price * el.count;
        })

        orderInfoObj.otherInfo.total_price = orderInfoObj.orderProducts.reduce((acc, el) => acc + el.product_price, 0)

        return this.orderMail(orderInfoObj);
    }

    orderMail(orderInfo) {


        const orderTemplate = orderInfo.orderProducts.reduce((acc, el) => {
            const prodObj = Object.values(el).reduce((accum, element) => {
                return accum.concat(`<td>${element}</td>`);
            }, "")
            return acc.concat(`<tr>${prodObj}</tr>`)
        }, "")

        const userTemplate = Object.values(orderInfo.user).reduce((acc, el) => {
            return acc.concat(`<td>${el}</td>`)
        }, "")

        const mail = `<h1>Order number: ${orderInfo.otherInfo.id_order}</h1>
            
            <table border="1" cellpadding="5">
                <tr><td>Name:</td><td>Phone:</td><td>E-mail</tr>
                <tr>${userTemplate}</tr>
            </table>
            
            <p>See below for more details about your order</p>
            
            <table border="1" cellpadding="5">
                <tr><td>Product id:</td><td>Product name:</td><td>Price:</td><td>Units:</td><td>Count:</td><td>Price per item:</td></tr>
                ${orderTemplate}
            </table>
            <p><b>Total price: ${orderInfo.otherInfo.total_price}</b></p>`

        return {
            status: "ok",
            mail: mail,
        }
    }

    async addProductsToOrder(userData, queryValue) {
        await OrderModel.create({
            id_user: userData.id_user
        })

        const idOrder = await OrderModel.findAll({
            where: {
                id_user: userData.id_user,
            },
            attributes: [
                "id_order"
            ],
            order: [
                "id_order"
            ],
        })

        const order = queryValue.reduce((acc, el, index) => {
            acc.push({
                id_order: idOrder[idOrder.length - 1].dataValues.id_order,
                id_product: el.id,
                quantity: el.count,
            });

            return acc;
        }, []);


        await OrderitemModel.bulkCreate(order, {
            fields: ["id_order", "id_product", "quantity"]
        });


        return await this.orderInfo(userData, queryValue, idOrder);
    }

    async validateProducts(queryValue) {

        const validateIdProductsRes = await this.validateIdProducts(queryValue);

        if (validateIdProductsRes.status === "error") {
            return validateIdProductsRes;
        }

        const validateCountProductsRes = await this.validateCountProducts(queryValue);

        if (validateCountProductsRes.status === "error") {
            return validateCountProductsRes;
        }

        return {
            status: "ok",
            data: [],
            message: ""
        }
    }

    async validateIdProducts(queryValue) {
        const idProduct = await ProductModel.findAll({
            attributes: [
                "id_product",
            ]
        })
        const queryValueArr = queryValue.map(el => el.id);
        const idProductArr = idProduct.map(el => el.id_product);
        let validateProdId = queryValueArr.every(el => idProductArr.includes(el));
        let idIsValid = true;

        if (!validateProdId) {
            idIsValid = false;
        }

        if (idIsValid) {
            return {
                status: "ok",
                data: [],
                message: "",
            }
        } else {
            return {
                status: "error",
                data: queryValue,
                message: `Products are not found`
            }
        }
    }

    async validateCountProducts(queryValue) {
        const queryValueId = queryValue.map(el => el.id);
        const queryValueCount = queryValue.map(el => el.count);
        let countIsValid = true;

        let incorrectCount = queryValueCount.filter(el => el <= 0);

        if (incorrectCount.length >= 1) {
            return {
                status: "error",
                data: [],
                message: "Incorrect values of count"
            }
        }

        if (queryValueCount.filter(el => Number.isInteger(el)).length !== queryValueCount.length) {
            return {
                status: "error",
                data: [],
                message: "Incorrect values of count"
            }
        }

        const amountProduct = await ProductModel.findAll({
            where: {
                id_product: {
                    [Op.in]: queryValueId
                }
            },
            attributes: [
                "id_product",
                "amount",
            ]
        })

        for (let i = 0; i < queryValueCount.length; i++) {
            if (queryValueCount[i] > amountProduct[i].amount) {
                countIsValid = false
            }
        }

        if (countIsValid) {
            return {
                status: "ok",
                data: [],
                message: ""
            }
        } else {
            return {
                status: "error",
                data: amountProduct.rows,
                message: "Not enough products"
            }
        }
    }
}

const orderMod = new OrderModules();

module.exports = orderMod;