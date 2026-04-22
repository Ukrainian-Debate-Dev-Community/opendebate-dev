const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { User } = require("../models/main");
const AppError = require("../utils/AppError");

// helper to sign tokens with user_id
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createUser = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // throw custom error
    if (!username || !password) {
      throw new AppError("Please provide username and password.", 400);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // if the username already exists, Sequelize throws a UniqueConstraintError. And it's covered in middleware
    const newUser = await User.create({
      username,
      password: hashedPassword,
    });

    // Generate JWT
    const token = signToken(newUser.id);

    res.status(201).json({
      status: "success",
      token,
      data: { id: newUser.id, username: newUser.username },
    });
  } catch (error) {
    // pass all errors to the global handler because I'm cool as fuck
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw new AppError("Please provide both a username and a password.", 400);
    }

    const user = await User.findOne({ where: { username } });

    if (!user || user.is_deleted) {
      throw new AppError("Invalid credentials.", 401);
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new AppError("Invalid credentials.", 401);
    }

    const token = signToken(user.id);

    res.status(200).json({
      status: "success",
      message: "Login successful.",
      token,
      data: { id: user.id, username: user.username },
    });
  } catch (error) {
    next(error);
  }
};

const updatePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      throw new AppError("Please provide both old and new passwords.", 400);
    }

    const user = await User.findByPk(req.user.id);

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      throw new AppError("Password mismatch.", 401);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedNewPassword;
    await user.save();

    res
      .status(200)
      .json({ status: "success", message: "Password updated successfully." });
  } catch (error) {
    next(error);
  }
};

const updateUsername = async (req, res, next) => {
  try {
    const { username } = req.body;

    if (!username) {
      throw new AppError("Please provide a new username.", 400);
    }

    const user = await User.findByPk(req.user.id);

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    // UniqueConstraintError from Sequelize happens here if taken. And it also covered in the middleware
    user.username = username;
    await user.save();

    res.status(200).json({
      status: "success",
      message: "Username updated successfully.",
      data: { username: user.username },
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    // try the Hard Delete
    await user.destroy();

    res.status(204).json({ status: "success", data: null });
  } catch (error) {
    // if SQL Server blocked it due to historical data => Soft Delete
    if (error.name === "SequelizeForeignKeyConstraintError") {
      try {
        const userToSoftDelete = await User.findByPk(req.params.id);

        // flip the state
        userToSoftDelete.is_deleted = true;

        // replace the username to the deleted_user with a random UUID
        userToSoftDelete.username = `deleted_user_${crypto.randomUUID()}`;

        // regenerate the password so the account can never be accessed again
        userToSoftDelete.password = crypto.randomBytes(32).toString("hex");

        await userToSoftDelete.save();

        return res.status(200).json({
          status: "success",
          message: "User anonymised successfully due to historical records.",
        });
      } catch (softDeleteError) {
        return next(softDeleteError);
      }
    }

    // if it was any other error, pass it to the global handler
    next(error);
  }
};

module.exports = {
  createUser,
  login,
  updatePassword,
  updateUsername,
  deleteUser,
};
