const Booking = require("../models/Booking");

const isAdmin = (user) => user.role === "admin";

const isParticipant = (conversation, userId) =>
  conversation.participants.some((p) => String(p) === String(userId));

async function canChat(currentUser, otherUser) {
  if (!currentUser || !otherUser) return false;
  if (String(currentUser._id) === String(otherUser._id)) return false;

  if (currentUser.role === "admin") {
    return true;
  }

  if (otherUser.role === "admin") {
    return true;
  }

  // operator <-> customer only if assigned booking exists
  const isOperatorCustomerPair =
    (currentUser.role === "operator" && otherUser.role === "user") ||
    (currentUser.role === "user" && otherUser.role === "operator");

  if (!isOperatorCustomerPair) {
    return false;
  }

  const operatorId =
    currentUser.role === "operator" ? currentUser._id : otherUser._id;
  const customerId =
    currentUser.role === "user" ? currentUser._id : otherUser._id;

  const booking = await Booking.findOne({
    operatorId,
    userId: customerId,
  });

  return Boolean(booking);
}

module.exports = { canChat, isParticipant, isAdmin };